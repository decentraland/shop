import { describe, it, expect, beforeEach, vi } from 'vitest'
import { TradeAssetType, type Trade } from '@dcl/schemas'
import type { ethers as Ethers } from 'ethers'

// Records the on-chain calls buyWithMana makes so we can assert the allowance-then-accept sequence.
const approveCalls: Array<{ spender: string; amount: string }> = []
const acceptCalls: Array<{ trades: unknown[] }> = []
let allowanceWei = '0' // current MANA→marketplace allowance the mocked ERC20 reports

vi.mock('decentraland-transactions', () => ({
  ContractName: { MANAToken: 'MANAToken', CreditsManager: 'CreditsManager' },
  getContractName: () => 'DecentralandMarketplacePolygon',
  getContract: (name: string) => ({
    address: name === 'MANAToken' ? '0xmana' : name === 'CreditsManager' ? '0xcreditsmanager' : '0xmarket',
    name,
    version: '1',
    abi: ['function accept(uint256[] x)']
  }),
  sendMetaTransaction: vi.fn(),
  MetaTransactionError: class MetaTransactionError extends Error {},
  ErrorCode: { USER_DENIED: 'USER_DENIED' }
}))

// Direct (gas-paying) path: keep the gasless relayer off so buyWithMana takes the accept() branch and
// ensureAuthorization takes the direct approve() branch.
vi.mock('~/lib/gasless-config', () => ({ gaslessConfig: { enabled: false, relayerUrl: '' } }))
vi.mock('~/config', () => ({ config: { rpcUrl: 'http://localhost', chainId: 80002 } }))

vi.mock('ethers', async importOriginal => {
  const actual = await importOriginal<typeof import('ethers')>()
  class MockContract {
    constructor(
      public address: string,
      public abi: unknown,
      public signerOrProvider: unknown
    ) {}
    async allowance() {
      return actual.ethers.BigNumber.from(allowanceWei)
    }
    async approve(spender: string, amount: Ethers.BigNumber) {
      approveCalls.push({ spender, amount: amount.toString() })
      return { wait: async () => ({ transactionHash: '0xapprove' }) }
    }
    async accept(trades: unknown[]) {
      acceptCalls.push({ trades })
      return { wait: async () => ({ transactionHash: '0xmanahash' }) }
    }
  }
  class MockJsonRpcProvider {
    constructor(public url: string) {}
  }
  return {
    ethers: {
      ...actual.ethers,
      Contract: MockContract,
      providers: { ...actual.ethers.providers, JsonRpcProvider: MockJsonRpcProvider }
    }
  }
})

// The combined rail delegates settlement to buyWithCredits — capture its args to assert the money math
// (maxCreditedValue must be credits + gap, which is how buildUseCreditsArgs derives the uncredited leg).
const useCreditsCalls: Array<{ maxCreditedValue?: string; credits: unknown[] }> = []
vi.mock('~/lib/buy', () => ({
  buyWithCredits: vi.fn(async (opts: { maxCreditedValue?: string; credits: unknown[] }) => {
    useCreditsCalls.push({ maxCreditedValue: opts.maxCreditedValue, credits: opts.credits })
    return '0xcombinedhash'
  })
}))

import { buyWithMana, buyWithCreditsAndMana } from '~/lib/buy-mana'

const ADDR = (n: string) => '0x' + n.repeat(20)
const BUYER = ADDR('44')

function fakeTrade(): Trade {
  return {
    id: 'trade',
    signer: ADDR('11'),
    signature: '0x',
    network: 'MATIC',
    chainId: 80002,
    type: 'public_nft_order',
    contract: '0xmarket',
    checks: {
      uses: 1,
      expiration: 2_000_000,
      effective: 1_000_000,
      salt: '0x' + '0'.repeat(64),
      contractSignatureIndex: 0,
      signerSignatureIndex: 0,
      allowedRoot: '0x',
      allowedProof: [],
      externalChecks: []
    },
    sent: [{ assetType: TradeAssetType.ERC721, contractAddress: ADDR('22'), value: '5', tokenId: '5', extra: '0x' }],
    received: [
      {
        assetType: TradeAssetType.USD_PEGGED_MANA,
        contractAddress: ADDR('33'),
        value: '1000000000000000000',
        amount: '1000000000000000000',
        beneficiary: ADDR('11'),
        extra: '0x'
      }
    ]
  } as unknown as Trade
}

// Wallet already on the trade's chain so ensureChain no-ops.
const signer = {
  getAddress: async () => BUYER,
  provider: {
    getNetwork: async () => ({ chainId: 80002 }),
    send: async () => undefined
  }
} as unknown as Ethers.providers.JsonRpcSigner

describe('buyWithMana (direct settlement)', () => {
  beforeEach(() => {
    approveCalls.length = 0
    acceptCalls.length = 0
    allowanceWei = '0'
  })

  it('approves the marketplace then fulfils the trade with accept(), returning the tx hash', async () => {
    const hash = await buyWithMana({ trade: fakeTrade(), buyer: BUYER, signer })

    expect(approveCalls).toHaveLength(1)
    expect(approveCalls[0].spender).toBe('0xmarket')
    expect(acceptCalls).toHaveLength(1)
    expect(acceptCalls[0].trades).toHaveLength(1)
    expect(hash).toBe('0xmanahash')
  })

  it('skips the approval when the marketplace allowance is already set', async () => {
    allowanceWei = '1000000000000000000000000'
    const hash = await buyWithMana({ trade: fakeTrade(), buyer: BUYER, signer })

    expect(approveCalls).toHaveLength(0)
    expect(acceptCalls).toHaveLength(1)
    expect(hash).toBe('0xmanahash')
  })
})

// A server-signed ephemeral credit worth `availableAmount` of MANA.
const credit = (availableAmount: string) =>
  ({ id: 'credit-1', amount: availableAmount, availableAmount, expiresAt: '2000000', signature: '0xsig' }) as never

describe('buyWithCreditsAndMana (credits first, MANA covers the remainder)', () => {
  beforeEach(() => {
    approveCalls.length = 0
    acceptCalls.length = 0
    useCreditsCalls.length = 0
    allowanceWei = '0'
  })

  it('approves the CREDITSMANAGER (not the marketplace) to pull the MANA leg', async () => {
    await buyWithCreditsAndMana({
      trade: fakeTrade(),
      buyer: BUYER,
      signer,
      credits: [credit('400')],
      manaGapWei: 600n
    })

    expect(approveCalls).toHaveLength(1)
    expect(approveCalls[0].spender).toBe('0xcreditsmanager')
    // It never calls accept() directly — settlement goes through useCredits.
    expect(acceptCalls).toHaveLength(0)
  })

  it('sets maxCreditedValue to credits + gap so the uncredited leg is exactly the MANA gap', async () => {
    await buyWithCreditsAndMana({
      trade: fakeTrade(),
      buyer: BUYER,
      signer,
      credits: [credit('400')],
      manaGapWei: 600n
    })

    expect(useCreditsCalls).toHaveLength(1)
    // 400 credited + 600 gap = 1000 → buildUseCreditsArgs yields maxUncreditedValue 1000 - 400 = 600.
    expect(useCreditsCalls[0].maxCreditedValue).toBe('1000')
  })

  it('sums MULTIPLE credits when sizing the cap', async () => {
    await buyWithCreditsAndMana({
      trade: fakeTrade(),
      buyer: BUYER,
      signer,
      credits: [credit('300'), credit('250')],
      manaGapWei: 450n
    })

    expect(useCreditsCalls[0].maxCreditedValue).toBe('1000')
  })

  it('returns the settlement tx hash', async () => {
    const hash = await buyWithCreditsAndMana({
      trade: fakeTrade(),
      buyer: BUYER,
      signer,
      credits: [credit('400')],
      manaGapWei: 600n
    })
    expect(hash).toBe('0xcombinedhash')
  })

  it('skips the approval when the CreditsManager allowance is already set', async () => {
    allowanceWei = '1000000000000000000000000'
    await buyWithCreditsAndMana({
      trade: fakeTrade(),
      buyer: BUYER,
      signer,
      credits: [credit('400')],
      manaGapWei: 600n
    })
    expect(approveCalls).toHaveLength(0)
    expect(useCreditsCalls).toHaveLength(1)
  })

  it('refuses a MANA-only purchase (useCredits reverts with NoCredits on an empty credits array)', async () => {
    await expect(
      buyWithCreditsAndMana({ trade: fakeTrade(), buyer: BUYER, signer, credits: [], manaGapWei: 600n })
    ).rejects.toThrow(/buyWithMana/)
    expect(useCreditsCalls).toHaveLength(0)
    expect(approveCalls).toHaveLength(0)
  })

  it('refuses a zero gap (that is a credits-only purchase, no MANA needed)', async () => {
    await expect(
      buyWithCreditsAndMana({ trade: fakeTrade(), buyer: BUYER, signer, credits: [credit('400')], manaGapWei: 0n })
    ).rejects.toThrow(/buyWithCredits/)
    expect(useCreditsCalls).toHaveLength(0)
  })
})
