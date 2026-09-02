import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TradeAssetType, type Trade } from '@dcl/schemas'
import type { ethers as Ethers } from 'ethers'

// Capture every CreditsManager.useCredits(args) call so we can assert on batching.
const useCreditsCalls: Array<Record<string, any>> = []
// 1-based index of the first useCredits call that should reject, or null for none. Lets a test reproduce the
// buyer who confirms the first wallet prompt of a mixed basket and rejects the second.
let useCreditsRejectsFrom: number | null = null
// Which useCredits call (1-based) mines and REVERTS. Its wait() rejects the way ethers v5 does for a status-0
// receipt — with the receipt attached — which is the only signal that says the credits were NOT consumed.
let useCreditsRevertsAt: number | null = null
// Capture cancelSignature(trades[], overrides) calls to assert the cancel path.
const cancelCalls: Array<{ trades: Record<string, any>[]; overrides: Record<string, any> }> = []

// The mocked marketplace/aggregator name+chain resolution, tweakable per-test.
let contractName = 'DecentralandMarketplacePolygon'
// The values the mocked on-chain MANA/USD oracle returns for the USD_PEGGED_MANA price path.
let aggAddr = '0xaggregator'
let aggDecimals = 8
let aggAnswer = '50000000' // int256 latestRoundData answer: $0.50/MANA at 8 decimals

vi.mock('decentraland-transactions', () => ({
  ContractName: { CreditsManager: 'CreditsManager', CollectionStore: 'CollectionStore' },
  getContractName: () => contractName,
  // abi only needs an `accept` fragment so Interface.getSighash('accept') resolves a selector.
  getContract: (name: string) => ({
    address: name === 'CreditsManager' ? '0xcreditsmanager' : name === 'CollectionStore' ? '0xstore' : '0xmarket',
    name,
    version: '1',
    // Both fragments so Interface.getSighash resolves for the trade path (accept) and the store path
    // (buy). The store tuple must match the real CollectionStore ItemToBuy[] or the encoder throws.
    abi: [
      'function accept(uint256[] x)',
      'function buy(tuple(address collection,uint256[] ids,uint256[] prices,address[] beneficiaries)[] items)'
    ]
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
// are only reached on the gasless branch, which is off here).
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
      // `hash` is the BROADCAST identity (available the moment the wallet submits) and
      // `wait().transactionHash` the settled one. They are separate on purpose: a caller has to be able to
      // tell "this went out" from "this mined", because a transaction that went out has spent its credits
      // whether or not it mines.
      const n = useCreditsCalls.length
      if (useCreditsRejectsFrom !== null && n >= useCreditsRejectsFrom) {
        throw new Error('user rejected transaction')
      }
      // The SETTLED hash stays '0xhash' so existing assertions are unaffected; the BROADCAST hash is
      // per-call so a test can tell which group went out.
      if (useCreditsRevertsAt === n) {
        return {
          hash: `0xbroadcast${n}`,
          wait: async () => {
            const err = new Error('transaction failed') as Error & { code: string; receipt: { status: number } }
            err.code = 'CALL_EXCEPTION'
            err.receipt = { status: 0 }
            throw err
          }
        }
      }
      return { hash: `0xbroadcast${n}`, wait: async () => ({ transactionHash: '0xhash' }) }
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

import {
  buyWithCredits,
  buyOneWithCredits,
  buyManyWithCredits,
  cancelListing,
  groupPurchases,
  purchaseGroupKey,
  type AnyPurchase,
  type CreditPurchase,
  type SpendableCredit
} from '~/lib/buy'

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

// Mock wallet. `walletChainId` is the network it is currently on, answered through `eth_chainId` the way
// a real wallet does. Every request is recorded so a test can assert the shop never asked it to MOVE:
// changing networks is the user's decision now, made from the navbar, never a side effect of a purchase.
let walletChainId = 80002
let switchHonored = true
const switchCalls: Array<{ method: string; params: unknown }> = []
const signer = {
  provider: {
    getNetwork: async () => ({ chainId: walletChainId }),
    send: async (method: string, params: unknown[]) => {
      switchCalls.push({ method, params })
      if (method === 'eth_chainId') return `0x${walletChainId.toString(16)}`
      if (method === 'wallet_switchEthereumChain' && switchHonored) {
        walletChainId = parseInt((params[0] as { chainId: string }).chainId, 16)
      }
      return undefined
    }
  }
} as unknown as Ethers.Signer

describe('when buying several listings on the same marketplace with credits', () => {
  beforeEach(() => {
    useCreditsCalls.length = 0
    useCreditsRejectsFrom = null
    useCreditsRevertsAt = null
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

  /**
   * A checkout now authorizes ONE credit for a whole transaction group, so the lines of that group hand back
   * the same credit and the same cap. Both have to be counted once.
   */
  describe('when the lines of a group share one authorized credit', () => {
    const shared = credit(B32('7'), '300')
    const purchases: CreditPurchase[] = [
      { trade: fakeTrade('0xmarket'), credits: [shared], maxCreditedValue: '300' },
      { trade: fakeTrade('0xmarket'), credits: [shared], maxCreditedValue: '300' },
      { trade: fakeTrade('0xmarket'), credits: [shared], maxCreditedValue: '300' }
    ]

    // Three entries backed by one signature and one salt is at best redundant and at worst rejected.
    it('passes that credit to the contract exactly once', async () => {
      await buyManyWithCredits({ purchases, buyer: BUYER, signer })

      expect(useCreditsCalls).toHaveLength(1)
      expect(useCreditsCalls[0].credits).toHaveLength(1)
      expect(useCreditsCalls[0].creditsSignatures).toHaveLength(1)
    })

    // Summing per line would ask for 900 against a cap the server signed for 300 — three times the credit
    // that actually exists.
    it('asks for the group cap once rather than once per line', async () => {
      await buyManyWithCredits({ purchases, buyer: BUYER, signer })

      expect(useCreditsCalls[0].maxCreditedValue).toBe('300')
    })

    // The old shape must keep working while anything is still authorized a credit at a time.
    it('still sums caps when the lines hold distinct credits', async () => {
      await buyManyWithCredits({
        purchases: [
          { trade: fakeTrade('0xmarket'), credits: [credit(B32('1'), '100')], maxCreditedValue: '100' },
          { trade: fakeTrade('0xmarket'), credits: [credit(B32('2'), '200')], maxCreditedValue: '200' }
        ],
        buyer: BUYER,
        signer
      })

      expect(useCreditsCalls[0].credits).toHaveLength(2)
      expect(useCreditsCalls[0].maxCreditedValue).toBe('300')
    })
  })
})

/**
 * The CollectionStore path. These items are the majority of the sellable catalogue and are NOT trades:
 * primary minting has no order, so it settles through CollectionStore.buy instead of accept().
 */
describe('when buying CollectionStore mints with credits', () => {
  // A real 20-byte address: the abi encoder validates `collection` and rejects a placeholder.
  const COLLECTION = '0x' + '11'.repeat(20)
  const storeItem = (itemId: string, priceWei = '1000') => ({
    collection: COLLECTION,
    itemId,
    priceWei
  })
  const storeLine = (itemId: string, creditId: string, cap: string): AnyPurchase => ({
    kind: 'store',
    item: storeItem(itemId),
    credits: [credit(B32(creditId), cap)],
    maxCreditedValue: cap,
    chainId: 80002
  })

  beforeEach(() => {
    useCreditsCalls.length = 0
    useCreditsRejectsFrom = null
    useCreditsRevertsAt = null
    walletChainId = 80002
    switchHonored = true
    switchCalls.length = 0
  })

  it('mints every item in ONE call, since buy() takes an array', async () => {
    const hashes = await buyManyWithCredits({
      purchases: [storeLine('1', '1', '100'), storeLine('2', '2', '200')],
      buyer: BUYER,
      signer
    })

    expect(hashes).toEqual(['0xhash'])
    expect(useCreditsCalls).toHaveLength(1)
    expect(useCreditsCalls[0].credits).toHaveLength(2)
  })

  it('targets the CollectionStore, not the marketplace', async () => {
    await buyManyWithCredits({ purchases: [storeLine('1', '1', '100')], buyer: BUYER, signer })

    expect(useCreditsCalls[0].externalCall.target).toBe('0xstore')
  })

  it('sizes the cap from what the server authorized and leaves nothing uncredited', async () => {
    await buyManyWithCredits({
      purchases: [storeLine('1', '1', '100'), storeLine('2', '2', '200')],
      buyer: BUYER,
      signer
    })

    // Summed from maxCreditedValue (the server-sized MANA), never re-derived from item prices — deriving
    // it from the price leaves a positive uncredited gap that the buyer pays out of their own MANA.
    expect(useCreditsCalls[0].maxCreditedValue).toBe('300')
    expect(useCreditsCalls[0].maxUncreditedValue).toBe('0')
  })

  it('names the buyer as the beneficiary so the mint does not land in the CreditsManager', async () => {
    await buyManyWithCredits({ purchases: [storeLine('1', '1', '100')], buyer: BUYER, signer })

    // The CreditsManager is msg.sender for the external call, so an unset beneficiary would mint to it.
    // The buyer address is abi-encoded into the calldata; assert it is present (lowercased, no 0x).
    expect(useCreditsCalls[0].externalCall.data.toLowerCase()).toContain(BUYER.toLowerCase().slice(2))
  })

  it('splits a MIXED basket into one call per path', async () => {
    const purchases: AnyPurchase[] = [
      { kind: 'trade', trade: fakeTrade('0xmarket'), credits: [credit(B32('1'), '100')], maxCreditedValue: '100' },
      storeLine('2', '2', '200')
    ]

    const hashes = await buyManyWithCredits({ purchases, buyer: BUYER, signer })

    // useCredits takes ONE external call, so a trade (accept) and a mint (buy) cannot share a transaction.
    expect(hashes).toHaveLength(2)
    expect(useCreditsCalls).toHaveLength(2)
    expect(useCreditsCalls.map(c => c.externalCall.target).sort()).toEqual(['0xmarket', '0xstore'])
    // Each call carries only its own group's credits and cap.
    expect(useCreditsCalls.map(c => c.maxCreditedValue).sort()).toEqual(['100', '200'])
  })

  it('reports each confirmation as it happens, so the UI can say which one is pending', async () => {
    const seen: Array<[number, number]> = []
    await buyManyWithCredits({
      purchases: [
        { kind: 'trade', trade: fakeTrade('0xmarket'), credits: [credit(B32('1'), '100')], maxCreditedValue: '100' },
        storeLine('2', '2', '200')
      ],
      buyer: BUYER,
      signer,
      onSigned: (signed, total) => seen.push([signed, total])
    })

    expect(seen).toEqual([
      [1, 2],
      [2, 2]
    ])
  })
})

/**
 * groupPurchases is exported for the UI, which has to tell a self-custody buyer how many confirmations to
 * expect. These pin that it agrees with what buyManyWithCredits actually submits — the count must come from
 * the same rule, not a second implementation in the view layer.
 */
describe('when grouping a basket into transactions', () => {
  const store = (chainId = 80002): AnyPurchase => ({
    kind: 'store',
    item: { collection: '0x' + '11'.repeat(20), itemId: '1', priceWei: '1' },
    credits: [],
    maxCreditedValue: '0',
    chainId
  })

  it('collapses trades on one marketplace into a single group', () => {
    const groups = groupPurchases([
      { trade: fakeTrade('0xmarket'), credits: [], maxCreditedValue: '0' },
      { trade: fakeTrade('0xmarket'), credits: [], maxCreditedValue: '0' }
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0].kind).toBe('trade')
  })

  it('collapses every store mint into a single group regardless of collection', () => {
    expect(groupPurchases([store(), store()])).toHaveLength(1)
  })

  it('separates the two paths, which is where the second confirmation comes from', () => {
    const groups = groupPurchases([{ trade: fakeTrade('0xmarket'), credits: [], maxCreditedValue: '0' }, store()])

    expect(groups).toHaveLength(2)
    expect(groups.map(g => g.kind).sort()).toEqual(['store', 'trade'])
  })

  it('accepts untagged trades, so callers that predate the store path keep working', () => {
    // The cart and the item page still pass bare CreditPurchase objects.
    const groups = groupPurchases([{ trade: fakeTrade('0xmarket'), credits: [], maxCreditedValue: '0' }])

    expect(groups).toHaveLength(1)
    expect(groups[0].kind).toBe('trade')
  })

  it('does not merge store mints across chains', () => {
    expect(groupPurchases([store(80002), store(137)])).toHaveLength(2)
  })
})

describe('when buying listings across different marketplaces', () => {
  beforeEach(() => {
    useCreditsCalls.length = 0
    useCreditsRejectsFrom = null
    useCreditsRevertsAt = null
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

  /**
   * What a caller needs to survive a partial failure.
   *
   * A mixed basket needs one transaction per group, so the buyer can confirm the first prompt and reject the
   * second — and by then the first is irreversibly on its way. Whoever reserved the credits has to be able to
   * tell which reservations are spent, because releasing a spent one hands the buyer back money they already
   * spent: their balance rises, the reconciler debits it again once the squid indexes the consumption, and
   * anything bought in that gap drives the balance negative.
   */
  describe('and the buyer rejects the second prompt', () => {
    const twoMarketplaces = (): CreditPurchase[] => [
      { trade: fakeTrade('0xmarketA'), credits: [credit(B32('1'), '100')], maxCreditedValue: '100' },
      { trade: fakeTrade('0xmarketB'), credits: [credit(B32('2'), '200')], maxCreditedValue: '200' }
    ]

    it('reports the first group as broadcast before it throws', async () => {
      useCreditsRejectsFrom = 2
      const broadcast: Array<{ txHash: string; salts: string[] }> = []

      await expect(
        buyManyWithCredits({
          purchases: twoMarketplaces(),
          buyer: BUYER,
          signer,
          onBroadcast: info => broadcast.push(info)
        })
      ).rejects.toThrow(/rejected/)

      // Exactly the confirmed group, and its salts — which is what the caller must NOT release.
      expect(broadcast).toHaveLength(1)
      expect(broadcast[0].salts).toEqual([B32('1')])
      expect(broadcast[0].txHash).toBe('0xbroadcast1')
    })

    it('never reports the rejected group', async () => {
      useCreditsRejectsFrom = 2
      const salts: string[] = []

      await expect(
        buyManyWithCredits({
          purchases: twoMarketplaces(),
          buyer: BUYER,
          signer,
          onBroadcast: ({ salts: s }) => salts.push(...s)
        })
      ).rejects.toThrow()

      // B32('2') belongs to the rejected group: its reservation is safe to release, and MUST be released or
      // that much of the buyer's balance stays stranded until the TTL.
      expect(salts).not.toContain(B32('2'))
    })

    it('reports nothing when the buyer rejects the very first prompt', async () => {
      useCreditsRejectsFrom = 1
      const broadcast: Array<{ txHash: string; salts: string[] }> = []

      await expect(
        buyManyWithCredits({
          purchases: twoMarketplaces(),
          buyer: BUYER,
          signer,
          onBroadcast: info => broadcast.push(info)
        })
      ).rejects.toThrow()

      // Nothing went out, so everything is releasable — the pre-existing behaviour, which must not regress.
      expect(broadcast).toEqual([])
    })

    it('reports every group when the whole basket goes through', async () => {
      const broadcast: Array<{ txHash: string; salts: string[] }> = []

      await buyManyWithCredits({
        purchases: twoMarketplaces(),
        buyer: BUYER,
        signer,
        onBroadcast: info => broadcast.push(info)
      })

      expect(broadcast.flatMap(b => b.salts)).toEqual([B32('1'), B32('2')])
    })

    // Reported from the broadcast callback, not after the receipt: a transaction that was submitted and then
    // failed to mine (timeout, RPC drop) has still spent its credits.
    it('reports a group whose transaction was submitted even if it never settles', async () => {
      const broadcast: Array<{ txHash: string; salts: string[] }> = []
      const failingSigner = {
        ...signer,
        provider: signer.provider
      } as typeof signer
      // Make wait() reject for the first call only, leaving the submit itself successful.
      const contracts = await import('ethers')
      const spy = vi.spyOn(contracts.ethers, 'Contract' as never).mockImplementation(() => ({
        useCredits: async () => ({ hash: '0xbroadcast1', wait: async () => Promise.reject(new Error('timeout')) })
      }))

      const reverted: string[] = []
      try {
        await expect(
          buyManyWithCredits({
            purchases: [twoMarketplaces()[0]],
            buyer: BUYER,
            signer: failingSigner,
            onBroadcast: info => broadcast.push(info),
            onReverted: ({ salts }) => reverted.push(...salts)
          })
        ).rejects.toThrow(/timeout/)

        expect(broadcast).toHaveLength(1)
        expect(broadcast[0].salts).toEqual([B32('1')])
        // THE ASYMMETRY. A timeout carries no receipt, so the outcome is unknown and the credits may yet be
        // consumed — reporting it as reverted would hand the caller permission to release money that is gone.
        expect(reverted).toEqual([])
      } finally {
        // In a `finally` because a failing assertion above would otherwise leave this Contract stub — which has
        // no cancelSignature and no oracle methods — installed for every later test in the file.
        spy.mockRestore()
      }
    })

    /**
     * SETTLED is a different fact from BROADCAST, and the caller needs both.
     *
     * Broadcast answers "may I release these reservations?". Only settled answers "does the buyer own these
     * items?" — which is what decides whether a line leaves the cart. The first version of the cart fix used
     * broadcast for both, so a buyer whose transaction reverted lost the lines they never bought.
     */
    it('reports only the group that mined as settled', async () => {
      useCreditsRejectsFrom = 2
      const settled: Array<{ txHash: string; salts: string[] }> = []

      await expect(
        buyManyWithCredits({
          purchases: twoMarketplaces(),
          buyer: BUYER,
          signer,
          onSettled: info => settled.push(info)
        })
      ).rejects.toThrow()

      expect(settled).toHaveLength(1)
      expect(settled[0].salts).toEqual([B32('1')])
      // The SETTLED hash, not the broadcast one.
      expect(settled[0].txHash).toBe('0xhash')
    })

    it('reports a reverted group as reverted and never as settled', async () => {
      useCreditsRevertsAt = 1
      const broadcast: string[] = []
      const settled: string[] = []
      const reverted: string[] = []

      await expect(
        buyManyWithCredits({
          purchases: [twoMarketplaces()[0]],
          buyer: BUYER,
          signer,
          onBroadcast: ({ salts }) => broadcast.push(...salts),
          onSettled: ({ salts }) => settled.push(...salts),
          onReverted: ({ salts }) => reverted.push(...salts)
        })
      ).rejects.toThrow(/failed/)

      // It did go out...
      expect(broadcast).toEqual([B32('1')])
      // ...but it rolled back, so nothing was consumed and nothing was bought. Releasing this reservation is
      // both safe and necessary; claiming the item is neither.
      expect(reverted).toEqual([B32('1')])
      expect(settled).toEqual([])
    })

    it('reports a group that reverts AFTER an earlier group settled', async () => {
      useCreditsRevertsAt = 2
      const settled: string[] = []
      const reverted: string[] = []

      await expect(
        buyManyWithCredits({
          purchases: twoMarketplaces(),
          buyer: BUYER,
          signer,
          onSettled: ({ salts }) => settled.push(...salts),
          onReverted: ({ salts }) => reverted.push(...salts)
        })
      ).rejects.toThrow()

      // The exact partial-purchase shape: one paid for, one to release and keep in the cart.
      expect(settled).toEqual([B32('1')])
      expect(reverted).toEqual([B32('2')])
    })
  })

  /**
   * SINGLE-PURCHASE SIGNALS — the PDP flow (BuyModal / MarketCheckout) rather than the cart.
   *
   * Those components release their reservation when the buy throws, and until this existed they had no way to
   * know whether the transaction had gone out. A `wait()` that rejects AFTER a broadcast (the buyer hits
   * "Speed up" in MetaMask, so ethers reports TRANSACTION_REPLACED even though the replacement mined) had them
   * handing back a credit that was already consumed.
   */
  describe('when buying ONE listing and reporting what happened', () => {
    const one = (): CreditPurchase => ({
      trade: fakeTrade('0xmarketA'),
      credits: [credit(B32('1'), '100')],
      maxCreditedValue: '100'
    })

    it('reports the broadcast with its hash', async () => {
      const broadcast: string[] = []
      const p = one()

      await buyWithCredits({
        trade: p.trade,
        buyer: BUYER,
        signer,
        credits: p.credits,
        maxCreditedValue: p.maxCreditedValue,
        onBroadcast: ({ txHash }) => broadcast.push(txHash)
      })

      expect(broadcast).toEqual(['0xbroadcast1'])
    })

    it('reports a revert, so the caller may still release', async () => {
      useCreditsRevertsAt = 1
      let reverted = false
      const p = one()

      await expect(
        buyWithCredits({
          trade: p.trade,
          buyer: BUYER,
          signer,
          credits: p.credits,
          maxCreditedValue: p.maxCreditedValue,
          onReverted: () => {
            reverted = true
          }
        })
      ).rejects.toThrow(/failed/)

      // Status 0 rolled the call back: the credit was NOT consumed, so releasing it is correct and NOT
      // releasing would strand that much of the balance until the TTL.
      expect(reverted).toBe(true)
    })

    it('does NOT report a rejected signature as a revert', async () => {
      useCreditsRejectsFrom = 1
      const broadcast: string[] = []
      let reverted = false
      const p = one()

      await expect(
        buyWithCredits({
          trade: p.trade,
          buyer: BUYER,
          signer,
          credits: p.credits,
          maxCreditedValue: p.maxCreditedValue,
          onBroadcast: ({ txHash }) => broadcast.push(txHash),
          onReverted: () => {
            reverted = true
          }
        })
      ).rejects.toThrow(/rejected/)

      // Nothing went out at all, so the caller releases on the plain "nothing was broadcast" rule — the
      // revert signal is for a DIFFERENT situation and must not fire here.
      expect(broadcast).toEqual([])
      expect(reverted).toBe(false)
    })
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
    useCreditsRejectsFrom = null
    useCreditsRevertsAt = null
    walletChainId = 80002
    switchHonored = true
    switchCalls.length = 0
    contractName = 'DecentralandMarketplacePolygon'
    aggAddr = '0xaggregator'
    aggDecimals = 8
    aggAnswer = '50000000'
  })

  /**
   * A buyer on the wrong network is TOLD, not moved.
   *
   * This is the exact sequence that broke in production: someone set MetaMask to Ethereum on purpose, came
   * back to the shop, clicked buy — and the shop switched them to Polygon without asking. What they saw was a
   * wallet error that named a revert, and what they found afterwards was a wallet on a network they had not
   * chosen. Refusing keeps both facts straight: nothing is submitted, and the error names the two networks so
   * the message can tell them which control to use.
   */
  it('refuses to submit on the wrong chain, and never asks the wallet to switch', async () => {
    walletChainId = 1 // the buyer deliberately put their wallet on Ethereum

    await expect(
      buyWithCredits({
        trade: fakeTrade('0xmarket'), // chainId 80002 (Amoy)
        buyer: BUYER,
        signer,
        credits: [credit(B32('1'), '100')],
        maxCreditedValue: '100'
      })
    ).rejects.toMatchObject({ name: 'WrongNetworkError', current: 1, required: 80002 })

    expect(switchCalls.filter(c => c.method.startsWith('wallet_'))).toEqual([])
    // Never sent useCredits into the void on a chain where the CreditsManager holds no code — a no-op that
    // returns a SUCCESSFUL receipt while consuming no credits and buying no item.
    expect(useCreditsCalls).toHaveLength(0)
    // And the wallet is still where the buyer left it.
    expect(walletChainId).toBe(1)
  })

  it('submits without any wallet network request when the wallet is already on the trade chain', async () => {
    walletChainId = 80002

    await buyWithCredits({
      trade: fakeTrade('0xmarket'),
      buyer: BUYER,
      signer,
      credits: [credit(B32('1'), '100')],
      maxCreditedValue: '100'
    })

    expect(useCreditsCalls).toHaveLength(1)
    expect(switchCalls.filter(c => c.method.startsWith('wallet_'))).toEqual([])
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

/**
 * Buying ONE thing, whichever rail it is.
 *
 * The item page's Buy now settles a single purchase, and it used to be able to build only `accept([trade])` —
 * which is why a mint had no Buy now at all. These pin that one purchase reaches the right contract either way,
 * so the page can offer the same button for both kinds of listing.
 */
describe('when buying a single purchase of either kind', () => {
  const COLLECTION = '0x' + '22'.repeat(20)
  const mintPurchase = (cap: string): AnyPurchase => ({
    kind: 'store',
    item: { collection: COLLECTION, itemId: '9', priceWei: '1000' },
    credits: [credit(B32('1'), cap)],
    maxCreditedValue: cap,
    chainId: 80002
  })

  beforeEach(() => {
    useCreditsCalls.length = 0
    useCreditsRejectsFrom = null
    useCreditsRevertsAt = null
    walletChainId = 80002
    contractName = 'DecentralandMarketplacePolygon'
  })

  it('sends a mint to the CollectionStore', async () => {
    const hash = await buyOneWithCredits({ purchase: mintPurchase('100'), buyer: BUYER, signer })

    expect(hash).toBe('0xhash')
    expect(useCreditsCalls).toHaveLength(1)
    expect(useCreditsCalls[0].externalCall.target).toBe('0xstore')
    // The server-sized cap verbatim, so nothing is left uncredited for the buyer's own MANA to cover.
    expect(useCreditsCalls[0].maxCreditedValue).toBe('100')
  })

  it('sends a listing to the marketplace', async () => {
    await buyOneWithCredits({
      purchase: {
        kind: 'trade',
        trade: fakeTrade('0xmarket'),
        credits: [credit(B32('1'), '100')],
        maxCreditedValue: '100'
      },
      buyer: BUYER,
      signer
    })

    expect(useCreditsCalls[0].externalCall.target).toBe('0xmarket')
  })

  it('refuses a purchase with no credits before touching the chain', async () => {
    await expect(
      buyOneWithCredits({ purchase: { ...mintPurchase('100'), credits: [] }, buyer: BUYER, signer })
    ).rejects.toThrow('No credits to spend')
    expect(useCreditsCalls).toHaveLength(0)
  })

  it('reports a mined revert, so the credit can be released rather than stranded', async () => {
    useCreditsRevertsAt = 1
    const reverted: Array<string | null> = []

    await expect(
      buyOneWithCredits({
        purchase: mintPurchase('100'),
        buyer: BUYER,
        signer,
        onReverted: ({ txHash }) => reverted.push(txHash)
      })
    ).rejects.toThrow()

    // Reported once, for the attempt that reverted. (The hash is whatever the failed receipt carried — null
    // here, since the mock's receipt has none; a caller must read that as "this attempt is unresolved".)
    expect(reverted).toHaveLength(1)
  })

  it('refuses to submit a mint on the wrong chain, like any other purchase', async () => {
    walletChainId = 1

    await expect(buyOneWithCredits({ purchase: mintPurchase('100'), buyer: BUYER, signer })).rejects.toMatchObject({
      name: 'WrongNetworkError'
    })
    expect(useCreditsCalls).toHaveLength(0)
  })

  it('keys a purchase by the transaction it will settle in', () => {
    // What the cart's mixed-payment rail uses to attach each transaction's MANA gap to its own group.
    expect(purchaseGroupKey(mintPurchase('100'))).toBe('store:80002')
    expect(purchaseGroupKey({ kind: 'trade', trade: fakeTrade('0xMARKET'), credits: [], maxCreditedValue: '0' })).toBe(
      'trade:80002:0xmarket'
    )
  })
})

describe('when cancelling a listing', () => {
  const getAddress = vi.fn(async () => SELLER.toUpperCase())
  // cancelListing requires the wallet to be on the trade's chain before the direct tx; this provider already
  // is, so the check passes (the wrong-network case is covered above and in network.spec).
  const provider = {
    getNetwork: async () => ({ chainId: 80002 }),
    send: async (method: string) => (method === 'eth_chainId' ? '0x13882' : undefined)
  }
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

/**
 * The stage machine a multi-group basket needs, reproduced at the level Cart drives it.
 *
 * Cart's own handler is what decides whether the modal says "confirm" or "completing", and the modal spec
 * cannot cover it — that one feeds hand-written props, so it passed while the app could not advance the
 * counter at all. This pins the RULE against the real `onSigned` contract from buyManyWithCredits.
 */
describe('when driving the confirmation stage across groups', () => {
  const store = (id: string, cap: string): AnyPurchase => ({
    kind: 'store',
    item: { collection: '0x' + '11'.repeat(20), itemId: id, priceWei: '1000' },
    credits: [credit(B32(id), cap)],
    maxCreditedValue: cap,
    chainId: 80002
  })

  // Cart's handler, verbatim in shape: another group pending → back to awaiting-signature; last one → settling.
  const stageFor = (signed: number, total: number) => (signed < total ? 'awaiting-signature' : 'settling')

  beforeEach(() => {
    useCreditsCalls.length = 0
    useCreditsRejectsFrom = null
    useCreditsRevertsAt = null
    walletChainId = 80002
    switchHonored = true
  })

  it('should return to awaiting-signature while another prompt is still coming', async () => {
    const stages: Array<{ stage: string; current: number }> = []

    await buyManyWithCredits({
      purchases: [
        { kind: 'trade', trade: fakeTrade('0xmarket'), credits: [credit(B32('1'), '100')], maxCreditedValue: '100' },
        store('2', '200')
      ],
      buyer: BUYER,
      signer,
      onSigned: (signed, total) => stages.push({ stage: stageFor(signed, total), current: Math.min(signed + 1, total) })
    })

    // After the FIRST confirmation the wallet is about to pop a second prompt. A modal reading "completing"
    // there invites the buyer to dismiss it as a stray popup, stranding the rest of the basket.
    expect(stages).toEqual([
      { stage: 'awaiting-signature', current: 2 },
      { stage: 'settling', current: 2 }
    ])
  })

  it('should go straight to settling on a single-group basket', async () => {
    const stages: string[] = []

    await buyManyWithCredits({
      purchases: [
        { kind: 'trade', trade: fakeTrade('0xmarket'), credits: [credit(B32('1'), '100')], maxCreditedValue: '100' }
      ],
      buyer: BUYER,
      signer,
      onSigned: (signed, total) => stages.push(stageFor(signed, total))
    })

    expect(stages).toEqual(['settling'])
  })

  it('should report a 1-based index of the group just signed', async () => {
    const seen: Array<[number, number]> = []

    await buyManyWithCredits({
      purchases: [
        { kind: 'trade', trade: fakeTrade('0xmarket'), credits: [credit(B32('1'), '100')], maxCreditedValue: '100' },
        store('2', '200')
      ],
      buyer: BUYER,
      signer,
      onSigned: (signed, total) => seen.push([signed, total])
    })

    // Pinned because Cart's handler indexes off it: `signed` counts confirmations DONE, so the first call is
    // (1, 2) and not (0, 2). An off-by-one here silently makes the modal skip or repeat a step.
    expect(seen).toEqual([
      [1, 2],
      [2, 2]
    ])
  })
})

/**
 * The property that justifies exporting groupPurchases: the count the UI shows must match the transactions
 * actually submitted, in the same order. Two implementations of the rule would be free to drift.
 */
describe('when checking the grouping against what is submitted', () => {
  beforeEach(() => {
    useCreditsCalls.length = 0
    useCreditsRejectsFrom = null
    useCreditsRevertsAt = null
    walletChainId = 80002
    switchHonored = true
  })

  it('should submit exactly one call per group, in group order', async () => {
    const purchases: AnyPurchase[] = [
      { kind: 'trade', trade: fakeTrade('0xmarket'), credits: [credit(B32('1'), '100')], maxCreditedValue: '100' },
      {
        kind: 'store',
        item: { collection: '0x' + '11'.repeat(20), itemId: '2', priceWei: '1000' },
        credits: [credit(B32('2'), '200')],
        maxCreditedValue: '200',
        chainId: 80002
      }
    ]

    const groups = groupPurchases(purchases)
    await buyManyWithCredits({ purchases, buyer: BUYER, signer })

    expect(useCreditsCalls).toHaveLength(groups.length)
    // Order, not just count: onSigned's indexing and the buyer's "1 of 2" both depend on it.
    expect(useCreditsCalls.map(c => c.externalCall.target)).toEqual(
      groups.map(g => (g.kind === 'store' ? '0xstore' : '0xmarket'))
    )
  })
})
