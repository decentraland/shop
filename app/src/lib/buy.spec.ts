import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TradeAssetType, type Trade } from '@dcl/schemas'
import type { ethers as Ethers } from 'ethers'

// Capture every CreditsManager.useCredits(args) call so we can assert on batching.
const useCreditsCalls: Array<Record<string, any>> = []
// Capture cancelSignature(trades[], overrides) calls to assert the cancel path.
const cancelCalls: Array<{ trades: Record<string, any>[]; overrides: Record<string, any> }> = []

// The mocked marketplace/aggregator name+chain resolution, tweakable per-test.
let contractName = 'DecentralandMarketplacePolygon'
// The values the mocked on-chain MANA/USD oracle returns for the USD_PEGGED_MANA price path.
let aggAddr = '0xaggregator'
let aggDecimals = 8
let aggAnswer = '50000000' // int256 latestRoundData answer: $0.50/MANA at 8 decimals

vi.mock('decentraland-transactions', () => ({
  ContractName: { CreditsManager: 'CreditsManager' },
  getContractName: () => contractName,
  // abi only needs an `accept` fragment so Interface.getSighash('accept') resolves a selector.
  getContract: (name: string) => ({
    address: name === 'CreditsManager' ? '0xcreditsmanager' : '0xmarket',
    name,
    version: '1',
    abi: ['function accept(uint256[] x)']
  }),
  sendMetaTransaction: vi.fn(),
  MetaTransactionError: class MetaTransactionError extends Error {
    code: string
    constructor(message: string, code: string) {
      super(message)
      this.code = code
    }
  },
  ErrorCode: { USER_DENIED: 'USER_DENIED' }
}))

// These buy.spec tests cover the DIRECT (gas-paying) paths — sendUseCredits and cancelListing's
// fallback. Disable gasless so cancelListing skips the relayer branch (its gasless path is covered in
// cancel-listing.spec.ts). The real ~/lib/authorizations stays (buy.ts's metaTxProviderShim/readProvider
// are only reached on the gasless branch, which is off here; ensureChain resolves through it as before).
vi.mock('~/lib/gasless-config', () => ({ gaslessConfig: { enabled: false, relayerUrl: '' } }))

vi.mock('~/config', () => ({ config: { rpcUrl: 'http://localhost', chainId: 80002 } }))

// Keep real ethers utils/BigNumber; swap only Contract (so calls don't hit a chain) and
// JsonRpcProvider (so no socket opens). The single MockContract dispatches by method name:
// - useCredits: records args + returns a tx whose wait() yields a hash (credits buy path)
// - cancelSignature: records args + returns a tx (cancel-listing path)
// - manaUsdAggregator/decimals/latestRoundData: drive the USD_PEGGED_MANA oracle price read
vi.mock('ethers', async importOriginal => {
  const actual = await importOriginal<typeof import('ethers')>()
  class MockContract {
    constructor(
      public address: string,
      public abi: unknown,
      public signerOrProvider: unknown
    ) {}
    async useCredits(args: Record<string, any>) {
      useCreditsCalls.push(args)
      return { wait: async () => ({ transactionHash: '0xhash' }) }
    }
    async cancelSignature(trades: Record<string, any>[], overrides: Record<string, any>) {
      cancelCalls.push({ trades, overrides })
      return { wait: async () => ({ transactionHash: '0xcancelhash' }) }
    }
    async manaUsdAggregator() {
      return aggAddr
    }
    async decimals() {
      return aggDecimals
    }
    async latestRoundData() {
      // [roundId, answer, startedAt, updatedAt, answeredInRound]; only answer (index 1) is read.
      return [0, actual.ethers.BigNumber.from(aggAnswer), 0, 0, 0]
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

import { buyWithCredits, buyManyWithCredits, cancelListing, type CreditPurchase, type SpendableCredit } from '~/lib/buy'

const B32 = (n: string) => '0x' + n.repeat(64)
const ADDR = (n: string) => '0x' + n.repeat(20)
const SELLER = ADDR('11')
const NFT = ADDR('22')
const MANA = ADDR('33')
const BUYER = ADDR('44')

function credit(id: string, amount: string): SpendableCredit {
  return { id, amount, availableAmount: amount, expiresAt: 9_999_999_999, signature: '0xsig' }
}

// received[0].assetType is parameterised so we can exercise the plain-ERC20 (amount used directly)
// and USD_PEGGED_MANA (oracle-converted) price branches of tradeManaPriceWei.
function fakeTrade(contract: string, receivedAssetType: number = TradeAssetType.USD_PEGGED_MANA): Trade {
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
        assetType: receivedAssetType,
        contractAddress: MANA,
        value: '1000000000000000000',
        amount: '1000000000000000000',
        beneficiary: SELLER,
        extra: '0x'
      }
    ]
  } as unknown as Trade
}

// Mock wallet: `walletChainId` is what the wallet is currently on; a wallet_switchEthereumChain
// request moves it to the requested chain UNLESS `switchHonored` is false (simulates a wallet that
// silently ignores the switch). ensureChain + the post-switch guard in sendUseCredits read this.
let walletChainId = 80002
let switchHonored = true
const switchCalls: Array<{ method: string; params: unknown }> = []
const signer = {
  provider: {
    getNetwork: async () => ({ chainId: walletChainId }),
    send: async (method: string, params: unknown[]) => {
      switchCalls.push({ method, params })
      if (method === 'wallet_switchEthereumChain' && switchHonored) {
        walletChainId = parseInt((params[0] as { chainId: string }).chainId, 16)
      }
    }
  }
} as unknown as Ethers.Signer

describe('when buying several listings on the same marketplace with credits', () => {
  beforeEach(() => {
    useCreditsCalls.length = 0
    walletChainId = 80002
    switchHonored = true
    switchCalls.length = 0
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

  it('groups trades on the same marketplace case-insensitively into one tx', async () => {
    const purchases: CreditPurchase[] = [
      { trade: fakeTrade('0xMARKET'), credits: [credit(B32('1'), '100')], maxCreditedValue: '100' },
      { trade: fakeTrade('0xmarket'), credits: [credit(B32('2'), '200')], maxCreditedValue: '200' }
    ]
    const hashes = await buyManyWithCredits({ purchases, buyer: BUYER, signer })

    expect(hashes).toEqual(['0xhash'])
    expect(useCreditsCalls).toHaveLength(1)
    expect(useCreditsCalls[0].credits).toHaveLength(2)
  })

  it('and the basket is empty it throws', async () => {
    await expect(buyManyWithCredits({ purchases: [], buyer: BUYER, signer })).rejects.toThrow('No items to buy')
    expect(useCreditsCalls).toHaveLength(0)
  })
})

describe('when buying a single listing with credits', () => {
  beforeEach(() => {
    useCreditsCalls.length = 0
    walletChainId = 80002
    switchHonored = true
    switchCalls.length = 0
    contractName = 'DecentralandMarketplacePolygon'
    aggAddr = '0xaggregator'
    aggDecimals = 8
    aggAnswer = '50000000'
  })

  it('switches the wallet to the trade chain before submitting when it is on another network', async () => {
    walletChainId = 11155111 // wallet stuck on Sepolia (e.g. a restored session)

    await buyWithCredits({
      trade: fakeTrade('0xmarket'), // chainId 80002 (Amoy)
      buyer: BUYER,
      signer,
      credits: [credit(B32('1'), '100')],
      maxCreditedValue: '100'
    })

    // Asked the wallet to move to Amoy (0x13882), then submitted useCredits.
    expect(switchCalls).toContainEqual({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x13882' }] })
    expect(useCreditsCalls).toHaveLength(1)
  })

  it('aborts without submitting when the wallet stays on the wrong chain', async () => {
    walletChainId = 11155111 // Sepolia
    switchHonored = false // wallet ignores the switch request

    await expect(
      buyWithCredits({
        trade: fakeTrade('0xmarket'),
        buyer: BUYER,
        signer,
        credits: [credit(B32('1'), '100')],
        maxCreditedValue: '100'
      })
    ).rejects.toThrow(/Wrong network/)

    // Never sent useCredits into the void on Sepolia (the bug that let a no-op "succeed").
    expect(useCreditsCalls).toHaveLength(0)
  })

  it('and there are no credits it throws before touching the chain', async () => {
    await expect(buyWithCredits({ trade: fakeTrade('0xmarket'), buyer: BUYER, signer, credits: [] })).rejects.toThrow(
      'No credits to spend'
    )
    expect(useCreditsCalls).toHaveLength(0)
  })

  it('submits one useCredits() and returns its tx hash', async () => {
    const hash = await buyWithCredits({
      trade: fakeTrade('0xmarket'),
      buyer: BUYER,
      signer,
      credits: [credit(B32('1'), '100')],
      maxCreditedValue: '100'
    })

    expect(hash).toBe('0xhash')
    expect(useCreditsCalls).toHaveLength(1)
    expect(useCreditsCalls[0].credits).toHaveLength(1)
  })

  it('uses the server-supplied maxCreditedValue verbatim when given (skips the oracle)', async () => {
    await buyWithCredits({
      trade: fakeTrade('0xmarket'),
      buyer: BUYER,
      signer,
      credits: [credit(B32('1'), '100')],
      maxCreditedValue: '777'
    })

    expect(useCreditsCalls[0].maxCreditedValue).toBe('777')
  })

  it('derives the MANA cap from a plain ERC20 trade amount directly (no oracle conversion)', async () => {
    await buyWithCredits({
      trade: fakeTrade('0xmarket', TradeAssetType.ERC20),
      buyer: BUYER,
      signer,
      credits: [credit(B32('1'), '1000000000000000000')]
    })

    // ERC20 amount is used as-is: the trade's received[0].amount = 1e18.
    expect(useCreditsCalls[0].maxCreditedValue).toBe('1000000000000000000')
  })

  it('derives the MANA cap for a USD-pegged trade via the oracle, adding the +2% buffer', async () => {
    // amount 1e18 USD, rate 5e7 @ 8 decimals → manaWei = 1e18 * 1e8 / 5e7 = 2e18, then *102/100 = 2.04e18.
    await buyWithCredits({
      trade: fakeTrade('0xmarket', TradeAssetType.USD_PEGGED_MANA),
      buyer: BUYER,
      signer,
      credits: [credit(B32('1'), '2040000000000000000')]
    })

    expect(useCreditsCalls[0].maxCreditedValue).toBe('2040000000000000000')
  })

  it('honours the oracle decimals when converting the USD-pegged cap', async () => {
    aggDecimals = 18
    aggAnswer = '500000000000000000' // 0.5 @ 18 decimals
    // manaWei = 1e18 * 1e18 / 5e17 = 2e18, +2% → 2.04e18.
    await buyWithCredits({
      trade: fakeTrade('0xmarket', TradeAssetType.USD_PEGGED_MANA),
      buyer: BUYER,
      signer,
      credits: [credit(B32('1'), '2040000000000000000')]
    })

    expect(useCreditsCalls[0].maxCreditedValue).toBe('2040000000000000000')
  })
})

describe('when cancelling a listing', () => {
  const getAddress = vi.fn(async () => SELLER.toUpperCase())
  // cancelListing calls ensureChain(signer.provider, trade.chainId) before the tx; a provider already
  // on the trade's chain makes it a no-op (the switch path is covered in cancel-listing.spec).
  const provider = { getNetwork: async () => ({ chainId: 80002 }) }
  const cancelSigner = { getAddress, provider } as unknown as Ethers.Signer

  beforeEach(() => {
    cancelCalls.length = 0
    getAddress.mockClear()
    contractName = 'DecentralandMarketplacePolygon'
  })

  it('invalidates the trade signature and returns the tx hash', async () => {
    const hash = await cancelListing({ trade: fakeTrade('0xmarket'), signer: cancelSigner })

    expect(hash).toBe('0xcancelhash')
    expect(cancelCalls).toHaveLength(1)
    expect(getAddress).toHaveBeenCalledOnce()
  })

  it('passes the signer address (lowercased) as the on-chain trade beneficiary', async () => {
    await cancelListing({ trade: fakeTrade('0xmarket'), signer: cancelSigner })

    // cancelSignature takes a Trade[] (tuple[]); getOnChainTrade sets sent[].beneficiary to the
    // (lowercased) seller address.
    expect(Array.isArray(cancelCalls[0].trades)).toBe(true)
    expect(cancelCalls[0].trades).toHaveLength(1)
    expect(cancelCalls[0].trades[0].sent[0].beneficiary).toBe(SELLER)
    expect(cancelCalls[0].trades[0].signer).toBe(SELLER)
  })
})
