import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ethers } from 'ethers'
import { TradeAssetType, type Trade } from '@dcl/schemas'

// ~/lib/trades (imported for valueForAsset) pulls in decentraland-transactions at module load; stub
// it so its ESM/cross-chain deps don't get evaluated when importing the target. Real ethers stays.
vi.mock('decentraland-transactions', () => ({
  ContractName: { OffChainMarketplaceV2: 'OffChainMarketplaceV2', MANAToken: 'MANAToken' },
  getContract: () => ({
    address: '0x0000000000000000000000000000000000000000',
    name: 'DecentralandMarketplacePolygon',
    version: '1.0.0',
    abi: []
  })
}))

vi.mock('~/config', () => ({ config: { rpcUrl: 'http://localhost', chainId: 80002 } }))

import {
  getOnChainTrade,
  buildAcceptCalldata,
  amoyGasOverrides,
  idToSalt,
  buildUseCreditsArgs,
  type SpendableCredit
} from '~/lib/trade-encoding'

const B32 = (n: string) => '0x' + n.repeat(64)
const ADDR = (n: string) => '0x' + n.repeat(20)
const SELLER = ADDR('11')
const NFT = ADDR('22')
const MANA = ADDR('33')
const BUYER = ADDR('44')
const MARKET = ADDR('55')
// A valid `bytes` signature (65-byte EIP-712 shape) — the ABI encoder rejects odd-length/non-hex.
const SIG = '0x' + 'ab'.repeat(65)

// A public_nft_order paying MANA for one ERC721. Overrides let each test bend a single field.
function fakeTrade(overrides: Partial<Trade> = {}): Trade {
  return {
    id: 'trade',
    signer: SELLER,
    signature: SIG,
    network: 'MATIC',
    chainId: 80002,
    type: 'public_nft_order',
    checks: {
      uses: 1,
      expiration: 2_000_000,
      effective: 1_000_000,
      salt: B32('a'),
      contractSignatureIndex: 0,
      signerSignatureIndex: 0,
      allowedRoot: '0x',
      allowedProof: [],
      externalChecks: []
    },
    sent: [{ assetType: TradeAssetType.ERC721, contractAddress: NFT, value: '5', tokenId: '5', extra: '0x' }],
    received: [
      {
        assetType: TradeAssetType.USD_PEGGED_MANA,
        contractAddress: MANA,
        value: '1000000000000000000',
        amount: '1000000000000000000',
        beneficiary: SELLER,
        extra: '0x'
      }
    ],
    ...overrides
  } as unknown as Trade
}

const ACCEPT_ABI = ['function accept(uint256[] x)']
const ZERO32 = '0x' + '0'.repeat(64)

function credit(id: string, amount: string, availableAmount = amount): SpendableCredit {
  return { id, amount, availableAmount, expiresAt: 9_999_999_999, signature: '0xcreditsig' }
}

describe('when porting a trade to its on-chain shape', () => {
  it('overrides every sent asset beneficiary with the buyer', () => {
    const onchain = getOnChainTrade(fakeTrade(), BUYER)
    expect(onchain.sent[0].beneficiary).toBe(BUYER)
  })

  it('keeps a received asset beneficiary when present', () => {
    const onchain = getOnChainTrade(fakeTrade(), BUYER)
    expect(onchain.received[0].beneficiary).toBe(SELLER)
  })

  it('falls back to the buyer when a received asset has no beneficiary', () => {
    const trade = fakeTrade({
      received: [
        { assetType: TradeAssetType.USD_PEGGED_MANA, contractAddress: MANA, value: '1', amount: '1', extra: '0x' }
      ]
    } as unknown as Partial<Trade>)
    const onchain = getOnChainTrade(trade, BUYER)
    expect(onchain.received[0].beneficiary).toBe(BUYER)
  })

  it('resolves the sent value via valueForAsset (tokenId for ERC721)', () => {
    const onchain = getOnChainTrade(fakeTrade(), BUYER)
    expect(onchain.sent[0].value).toBe('5')
  })

  it('resolves the received value via valueForAsset (amount for USD-pegged MANA)', () => {
    const onchain = getOnChainTrade(fakeTrade(), BUYER)
    expect(onchain.received[0].value).toBe('1000000000000000000')
  })

  it('flattens allowedProof to an empty array', () => {
    const trade = fakeTrade({
      checks: { ...fakeTrade().checks, allowedProof: [B32('1'), B32('2')] }
    })
    const onchain = getOnChainTrade(trade, BUYER)
    expect(onchain.checks.allowedProof).toEqual([])
  })

  it('pads a short salt to 32 bytes', () => {
    const trade = fakeTrade({ checks: { ...fakeTrade().checks, salt: '0x01' } })
    const onchain = getOnChainTrade(trade, BUYER)
    expect(onchain.checks.salt).toBe(ethers.utils.hexZeroPad('0x01', 32))
    expect(onchain.checks.salt).toHaveLength(66)
  })

  it('normalizes an empty allowedRoot to the 32-byte zero root', () => {
    const trade = fakeTrade({ checks: { ...fakeTrade().checks, allowedRoot: '0x' } })
    const onchain = getOnChainTrade(trade, BUYER)
    expect(onchain.checks.allowedRoot).toBe(ZERO32)
  })

  it('keeps a real allowedRoot untouched', () => {
    const root = B32('b')
    const trade = fakeTrade({ checks: { ...fakeTrade().checks, allowedRoot: root } })
    const onchain = getOnChainTrade(trade, BUYER)
    expect(onchain.checks.allowedRoot).toBe(root)
  })

  it('converts millisecond expiration/effective to seconds', () => {
    const trade = fakeTrade({
      checks: { ...fakeTrade().checks, expiration: 2_000_000_000_000, effective: 1_500_000_000_000 }
    })
    const onchain = getOnChainTrade(trade, BUYER)
    expect(onchain.checks.expiration).toBe(2_000_000_000)
    expect(onchain.checks.effective).toBe(1_500_000_000)
  })

  it('leaves already-in-seconds expiration/effective unchanged', () => {
    const onchain = getOnChainTrade(fakeTrade(), BUYER)
    expect(onchain.checks.expiration).toBe(2_000_000)
    expect(onchain.checks.effective).toBe(1_000_000)
  })

  it('defaults a missing extra to 0x on both sides', () => {
    const trade = fakeTrade({
      sent: [{ assetType: TradeAssetType.ERC721, contractAddress: NFT, value: '5', tokenId: '5' }],
      received: [
        {
          assetType: TradeAssetType.USD_PEGGED_MANA,
          contractAddress: MANA,
          value: '1',
          amount: '1',
          beneficiary: SELLER
        }
      ]
    } as unknown as Partial<Trade>)
    const onchain = getOnChainTrade(trade, BUYER)
    expect(onchain.sent[0].extra).toBe('0x')
    expect(onchain.received[0].extra).toBe('0x')
  })

  it('maps external checks through, preserving their fields', () => {
    const check = { contractAddress: ADDR('66'), selector: '0xdeadbeef', value: '0x01', required: true }
    const trade = fakeTrade({ checks: { ...fakeTrade().checks, externalChecks: [check] } })
    const onchain = getOnChainTrade(trade, BUYER)
    expect(onchain.checks.externalChecks).toEqual([check])
  })

  it('treats a missing externalChecks list as empty', () => {
    const trade = fakeTrade({
      checks: { ...fakeTrade().checks, externalChecks: undefined }
    } as unknown as Partial<Trade>)
    const onchain = getOnChainTrade(trade, BUYER)
    expect(onchain.checks.externalChecks).toEqual([])
  })

  it('passes through signer and signature verbatim', () => {
    const onchain = getOnChainTrade(fakeTrade(), BUYER)
    expect(onchain.signer).toBe(SELLER)
    expect(onchain.signature).toBe(SIG)
  })
})

describe('when building the accept calldata', () => {
  it('derives the accept selector from the abi', () => {
    const { selector } = buildAcceptCalldata([fakeTrade()], BUYER, ACCEPT_ABI)
    const expected = new ethers.utils.Interface(ACCEPT_ABI).getSighash('accept')
    expect(selector).toBe(expected)
  })

  it('produces ABI-encoded data as a hex string', () => {
    const { data } = buildAcceptCalldata([fakeTrade()], BUYER, ACCEPT_ABI)
    expect(data).toMatch(/^0x[0-9a-f]+$/)
  })

  it('is deterministic — same trades and buyer encode byte-identically', () => {
    const a = buildAcceptCalldata([fakeTrade()], BUYER, ACCEPT_ABI)
    const b = buildAcceptCalldata([fakeTrade()], BUYER, ACCEPT_ABI)
    expect(a.data).toBe(b.data)
    expect(a.selector).toBe(b.selector)
  })

  it('encodes a different buyer to different calldata', () => {
    const a = buildAcceptCalldata([fakeTrade()], BUYER, ACCEPT_ABI)
    const b = buildAcceptCalldata([fakeTrade()], ADDR('99'), ACCEPT_ABI)
    expect(a.data).not.toBe(b.data)
  })

  it('encodes more trades to longer calldata than fewer', () => {
    const one = buildAcceptCalldata([fakeTrade()], BUYER, ACCEPT_ABI)
    const two = buildAcceptCalldata([fakeTrade(), fakeTrade()], BUYER, ACCEPT_ABI)
    expect(two.data.length).toBeGreaterThan(one.data.length)
  })
})

describe('when computing Amoy gas overrides', () => {
  it('returns no overrides off Amoy', () => {
    expect(amoyGasOverrides(1)).toEqual({})
    expect(amoyGasOverrides(137)).toEqual({})
  })

  it('floors the priority fee to 30 gwei on Amoy', () => {
    const { maxPriorityFeePerGas } = amoyGasOverrides(80002)
    expect(maxPriorityFeePerGas?.toString()).toBe(ethers.utils.parseUnits('30', 'gwei').toString())
  })

  it('sets maxFeePerGas to tip plus 50 gwei on Amoy', () => {
    const { maxFeePerGas } = amoyGasOverrides(80002)
    expect(maxFeePerGas?.toString()).toBe(ethers.utils.parseUnits('80', 'gwei').toString())
  })
})

describe('when turning a credit id into a salt', () => {
  it('returns the zero salt for an empty id', () => {
    expect(idToSalt('')).toBe(ZERO32)
  })

  it('left-pads a hex id to 32 bytes', () => {
    expect(idToSalt('0x01')).toBe(ethers.utils.hexZeroPad('0x01', 32))
  })

  it('keeps an already-32-byte hex id unchanged', () => {
    const full = B32('c')
    expect(idToSalt(full)).toBe(full)
  })

  it('hex-encodes a non-hex id then pads to 32 bytes', () => {
    const salt = idToSalt('abc')
    const expected = ethers.utils.hexZeroPad('0x' + Buffer.from('abc').toString('hex'), 32)
    expect(salt).toBe(expected)
    expect(salt).toHaveLength(66)
  })
})

describe('when building the useCredits args', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-04T00:00:00Z'))
  })

  it('maps each credit to value/expiresAt/salt', () => {
    const c = credit('0x01', '100')
    const args = buildUseCreditsArgs(MARKET, ACCEPT_ABI, [fakeTrade()], BUYER, [c], '100')
    expect(args.credits).toEqual([{ value: '100', expiresAt: 9_999_999_999, salt: idToSalt('0x01') }])
  })

  it('collects the credit signatures in order', () => {
    const args = buildUseCreditsArgs(
      MARKET,
      ACCEPT_ABI,
      [fakeTrade()],
      BUYER,
      [
        { ...credit('0x01', '100'), signature: '0xaaa' },
        { ...credit('0x02', '50'), signature: '0xbbb' }
      ],
      '150'
    )
    expect(args.creditsSignatures).toEqual(['0xaaa', '0xbbb'])
  })

  it('targets the given marketplace address in the external call', () => {
    const args = buildUseCreditsArgs(MARKET, ACCEPT_ABI, [fakeTrade()], BUYER, [credit('0x01', '100')], '100')
    expect(args.externalCall.target).toBe(MARKET)
  })

  it('embeds the accept selector and calldata in the external call', () => {
    const expected = buildAcceptCalldata([fakeTrade()], BUYER, ACCEPT_ABI)
    const args = buildUseCreditsArgs(MARKET, ACCEPT_ABI, [fakeTrade()], BUYER, [credit('0x01', '100')], '100')
    expect(args.externalCall.selector).toBe(expected.selector)
    expect(args.externalCall.data).toBe(expected.data)
  })

  it('sets the external call to expire 24h from now', () => {
    const args = buildUseCreditsArgs(MARKET, ACCEPT_ABI, [fakeTrade()], BUYER, [credit('0x01', '100')], '100')
    const now = Math.floor(Date.now() / 1000)
    expect(args.externalCall.expiresAt).toBe(now + 60 * 60 * 24)
  })

  it('uses a random 32-byte salt for the external call', () => {
    const args = buildUseCreditsArgs(MARKET, ACCEPT_ABI, [fakeTrade()], BUYER, [credit('0x01', '100')], '100')
    expect(args.externalCall.salt).toMatch(/^0x[0-9a-f]{64}$/)
  })

  it('leaves nothing uncredited when credits cover the cap exactly', () => {
    const args = buildUseCreditsArgs(MARKET, ACCEPT_ABI, [fakeTrade()], BUYER, [credit('0x01', '100')], '100')
    expect(args.maxUncreditedValue).toBe('0')
    expect(args.maxCreditedValue).toBe('100')
  })

  it('reports the gap as uncredited when credits fall short of the cap', () => {
    const args = buildUseCreditsArgs(MARKET, ACCEPT_ABI, [fakeTrade()], BUYER, [credit('0x01', '100', '60')], '100')
    expect(args.maxUncreditedValue).toBe('40')
  })

  it('clamps a negative uncredited amount to 0 when credits exceed the cap', () => {
    const args = buildUseCreditsArgs(MARKET, ACCEPT_ABI, [fakeTrade()], BUYER, [credit('0x01', '200')], '100')
    expect(args.maxUncreditedValue).toBe('0')
  })

  it('sums availableAmount across multiple credits for the uncredited gap', () => {
    const args = buildUseCreditsArgs(
      MARKET,
      ACCEPT_ABI,
      [fakeTrade()],
      BUYER,
      [credit('0x01', '100', '40'), credit('0x02', '100', '30')],
      '100'
    )
    expect(args.maxUncreditedValue).toBe('30')
  })

  it('always signs with the empty custom external call signature', () => {
    const args = buildUseCreditsArgs(MARKET, ACCEPT_ABI, [fakeTrade()], BUYER, [credit('0x01', '100')], '100')
    expect(args.customExternalCallSignature).toBe('0x')
  })
})
