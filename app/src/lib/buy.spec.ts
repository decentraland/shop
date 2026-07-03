import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TradeAssetType, type Trade } from '@dcl/schemas'
import type { ethers as Ethers } from 'ethers'

// Capture every CreditsManager.useCredits(args) call so we can assert on batching.
const useCreditsCalls: Array<Record<string, any>> = []

vi.mock('decentraland-transactions', () => ({
  ContractName: { CreditsManager: 'CreditsManager' },
  getContractName: () => 'DecentralandMarketplacePolygon',
  // abi only needs an `accept` fragment so Interface.getSighash('accept') resolves a selector.
  getContract: () => ({
    address: '0xmarket',
    name: 'DecentralandMarketplacePolygon',
    version: '1',
    abi: ['function accept(uint256[] x)']
  })
}))

vi.mock('~/config', () => ({ config: { rpcUrl: 'http://localhost', chainId: 80002 } }))

// Keep real ethers utils/BigNumber; swap only Contract so useCredits() doesn't hit a chain.
vi.mock('ethers', async importOriginal => {
  const actual = await importOriginal<typeof import('ethers')>()
  class MockContract {
    constructor(
      public address: string,
      public abi: unknown,
      public signer: unknown
    ) {}
    async useCredits(args: Record<string, any>) {
      useCreditsCalls.push(args)
      return { wait: async () => ({ transactionHash: '0xhash' }) }
    }
  }
  return { ethers: { ...actual.ethers, Contract: MockContract } }
})

// eslint-disable-next-line import/first
import { buyManyWithCredits, type CreditPurchase, type SpendableCredit } from '~/lib/buy'

const B32 = (n: string) => '0x' + n.repeat(64)
const ADDR = (n: string) => '0x' + n.repeat(20)
const SELLER = ADDR('11')
const NFT = ADDR('22')
const MANA = ADDR('33')
const BUYER = ADDR('44')

function credit(id: string, amount: string): SpendableCredit {
  return { id, amount, availableAmount: amount, expiresAt: 9_999_999_999, signature: '0xsig' }
}

function fakeTrade(contract: string): Trade {
  return {
    id: 'trade',
    signer: SELLER,
    signature: '0x',
    network: 'MATIC',
    chainId: 80002,
    type: 'public_nft_order',
    contract,
    checks: {
      uses: 1,
      expiration: 2_000_000,
      effective: 1_000_000,
      salt: B32('0'),
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
    ]
  } as unknown as Trade
}

const signer = {} as Ethers.Signer

describe('when buying several listings on the same marketplace with credits', () => {
  beforeEach(() => {
    useCreditsCalls.length = 0
  })

  it('spends every credit in a single useCredits() call', async () => {
    const purchases: CreditPurchase[] = [
      { trade: fakeTrade('0xmarket'), credits: [credit(B32('1'), '100')], maxCreditedValue: '100' },
      { trade: fakeTrade('0xmarket'), credits: [credit(B32('2'), '200')], maxCreditedValue: '200' }
    ]
    const hashes = await buyManyWithCredits({ purchases, buyer: BUYER, signer })

    expect(hashes).toEqual(['0xhash'])
    expect(useCreditsCalls).toHaveLength(1)
    expect(useCreditsCalls[0].credits).toHaveLength(2)
    expect(useCreditsCalls[0].creditsSignatures).toHaveLength(2)
  })

  it('sizes maxCreditedValue as the sum of the item caps and leaves nothing uncredited', async () => {
    const purchases: CreditPurchase[] = [
      { trade: fakeTrade('0xmarket'), credits: [credit(B32('1'), '100')], maxCreditedValue: '100' },
      { trade: fakeTrade('0xmarket'), credits: [credit(B32('2'), '200')], maxCreditedValue: '200' }
    ]
    await buyManyWithCredits({ purchases, buyer: BUYER, signer })

    expect(useCreditsCalls[0].maxCreditedValue).toBe('300')
    expect(useCreditsCalls[0].maxUncreditedValue).toBe('0')
  })
})

describe('when buying listings across different marketplaces', () => {
  beforeEach(() => {
    useCreditsCalls.length = 0
  })

  it('splits into one transaction per marketplace', async () => {
    const purchases: CreditPurchase[] = [
      { trade: fakeTrade('0xmarketA'), credits: [credit(B32('1'), '100')], maxCreditedValue: '100' },
      { trade: fakeTrade('0xmarketB'), credits: [credit(B32('2'), '200')], maxCreditedValue: '200' }
    ]
    const hashes = await buyManyWithCredits({ purchases, buyer: BUYER, signer })

    expect(hashes).toEqual(['0xhash', '0xhash'])
    expect(useCreditsCalls).toHaveLength(2)
  })
})
