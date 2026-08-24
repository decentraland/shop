import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ProviderType, TradeAssetType, type Trade } from '@dcl/schemas'
import type { ethers as Ethers } from 'ethers'

// Records the on-chain calls buyWithMana makes so we can assert the allowance-then-accept sequence.
const approveCalls: Array<{ spender: string; amount: string }> = []
const acceptCalls: Array<{ trades: unknown[] }> = []
const storeBuyCalls: Array<{ items: unknown[] }> = []
let allowanceWei = '0' // current MANA→spender allowance the mocked ERC20 reports

vi.mock('decentraland-transactions', () => ({
  ContractName: { MANAToken: 'MANAToken', CreditsManager: 'CreditsManager', CollectionStore: 'CollectionStore' },
  getContractName: () => 'DecentralandMarketplacePolygon',
  getContract: (name: string) => ({
    address:
      name === 'MANAToken'
        ? '0xmana'
        : name === 'CreditsManager'
          ? '0xcreditsmanager'
          : name === 'CollectionStore'
            ? '0xstore'
            : '0xmarket',
    name,
    version: '1',
    abi: ['function accept(uint256[] x)']
  }),
  sendMetaTransaction: vi.fn(),
  // Carries `code` like the real one: the rails branch on it, so a stub that dropped it would let a
  // dismissed signature fall through to the gas-paying fallback in the tests while failing in production.
  MetaTransactionError: class MetaTransactionError extends Error {
    code?: string
    constructor(message: string, code?: string) {
      super(message)
      this.code = code
    }
  },
  ErrorCode: { USER_DENIED: 'USER_DENIED' }
}))

// Direct (gas-paying) path: keep the gasless relayer off so buyWithMana takes the accept() branch and
// ensureAuthorization takes the direct approve() branch.
//
// MUTABLE, because the mixed rail has to be exercised BOTH ways: the relayed path is now the default and the
// direct one is only its fallback. Every describe below resets it, so a suite that forgets cannot inherit
// the previous one's rail.
// `vi.hoisted` because this module is pulled in through ~/lib/authorizations while the mock factories are
// still being hoisted — a plain const is in its TDZ by then and the whole suite fails to collect.
const { gaslessState } = vi.hoisted(() => ({ gaslessState: { enabled: false, relayerUrl: 'http://relayer' } }))
vi.mock('~/lib/gasless-config', () => ({ gaslessConfig: gaslessState }))
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
    async buy(items: unknown[]) {
      storeBuyCalls.push({ items })
      return { wait: async () => ({ transactionHash: '0xminthash' }) }
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

// The combined rail delegates settlement to the credits rail — capture the purchase it hands over to assert
// the money math (maxCreditedValue must be credits + gap, which is how the useCredits envelope derives the
// uncredited leg) and that the mint variant settles as a STORE purchase rather than a trade.
type CapturedPurchase = { kind: string; maxCreditedValue: string; credits: unknown[] }
const useCreditsCalls: CapturedPurchase[] = []
vi.mock('~/lib/buy', () => ({
  buyOneWithCredits: vi.fn(async (opts: { purchase: CapturedPurchase }) => {
    useCreditsCalls.push(opts.purchase)
    return '0xcombinedhash'
  })
}))

/**
 * The relayed rail, hoisted for the same reason as the config above.
 *
 * The error CLASSES are real (not vi.fn) because the rail branches on `instanceof` — a plain object would
 * take the wrong branch and every guard below would pass for the wrong reason.
 */
const { gaslessCalls, buyOneGasless, waitForSettlement, GaslessUnavailableError, SettlementPendingError } = vi.hoisted(
  () => {
    class GaslessUnavailableError extends Error {
      reason: string
      constructor(message: string, reason: string) {
        super(message)
        this.reason = reason
      }
    }
    class SettlementPendingError extends Error {}
    const gaslessCalls: Array<{ purchase: { kind: string; maxCreditedValue: string }; buyer: string }> = []
    return {
      gaslessCalls,
      buyOneGasless: vi.fn(async (opts: { purchase: { kind: string; maxCreditedValue: string }; buyer: string }) => {
        gaslessCalls.push(opts)
        return '0xrelayedhash'
      }),
      waitForSettlement: vi.fn(async (_hash: string) => {}),
      GaslessUnavailableError,
      SettlementPendingError
    }
  }
)
vi.mock('~/lib/buy-gasless', () => ({
  buyOneGasless,
  waitForSettlement,
  GaslessUnavailableError,
  SettlementPendingError
}))

// From the mock above, so `instanceof` in the rail matches what these tests throw.
import { ErrorCode, MetaTransactionError } from 'decentraland-transactions'
import { buyWithMana, buyMintWithMana, buyWithCreditsAndMana, buyMintWithCreditsAndMana } from '~/lib/buy-mana'

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

// Wallet already on the trade's chain, so the direct leg's network check passes.
const signer = {
  getAddress: async () => BUYER,
  provider: {
    getNetwork: async () => ({ chainId: 80002 }),
    send: async (method: string) => (method === 'eth_chainId' ? '0x13882' : undefined)
  }
} as unknown as Ethers.providers.JsonRpcSigner

// Every suite starts on the DIRECT rail; the relayed ones opt in. Reset here rather than per-suite so a new
// describe cannot silently inherit whichever rail the previous one left switched on.
beforeEach(() => {
  gaslessState.enabled = false
  gaslessCalls.length = 0
  useCreditsCalls.length = 0
  buyOneGasless.mockClear()
  waitForSettlement.mockClear()
  buyOneGasless.mockImplementation(async opts => {
    gaslessCalls.push(opts)
    return '0xrelayedhash'
  })
  waitForSettlement.mockImplementation(async () => {})
})

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

  /**
   * AN ALLOWANCE IS AN AMOUNT, AND THE GRANT HAS TO SAY SO.
   *
   * Asked as a flag, a leftover approval from a cheaper purchase answers "already approved" — so no approve
   * goes out and accept() then reverts on transferFrom, after the buyer has confirmed. A managed wallet
   * meets that with no approval step in front of it at all.
   */
  it('approves again when the leftover allowance is too small for THIS purchase', async () => {
    allowanceWei = '1' // some allowance, nowhere near the 1 MANA this trade costs

    await buyWithMana({ trade: fakeTrade(), buyer: BUYER, signer, manaWei: 10n ** 18n })

    expect(approveCalls).toHaveLength(1)
    expect(approveCalls[0].spender).toBe('0xmarket')
    expect(acceptCalls).toHaveLength(1)
  })

  it('still skips the approval when the allowance covers the amount', async () => {
    allowanceWei = '1000000000000000000000000'

    await buyWithMana({ trade: fakeTrade(), buyer: BUYER, signer, manaWei: 10n ** 18n })

    // Sizing the check must not make it ask for an approval the buyer does not need.
    expect(approveCalls).toHaveLength(0)
    expect(acceptCalls).toHaveLength(1)
  })
})

const fakeMint = () => ({
  item: { collection: ADDR('66'), itemId: '7', priceWei: '1000000000000000000' },
  chainId: 80002
})

/**
 * The mint's MANA rail. Every assertion here is the mint's answer to one above it for a listing — same steps,
 * same shape, different contract — because a buyer must not be able to tell the two purchases apart.
 */
describe('buyMintWithMana (direct settlement of a CollectionStore mint)', () => {
  beforeEach(() => {
    approveCalls.length = 0
    acceptCalls.length = 0
    storeBuyCalls.length = 0
    allowanceWei = '0'
  })

  it('approves the STORE then mints with buy(), returning the tx hash', async () => {
    const hash = await buyMintWithMana({ mint: fakeMint(), buyer: BUYER, signer })

    expect(approveCalls).toHaveLength(1)
    // The marketplace has no part in a mint, so it must never be the spender the buyer approves.
    expect(approveCalls[0].spender).toBe('0xstore')
    expect(storeBuyCalls).toHaveLength(1)
    expect(acceptCalls).toHaveLength(0)
    expect(hash).toBe('0xminthash')
  })

  it('names the BUYER as the beneficiary, so the minted item lands in their hands', async () => {
    await buyMintWithMana({ mint: fakeMint(), buyer: BUYER, signer })

    expect(storeBuyCalls[0].items).toEqual([
      { collection: ADDR('66'), ids: ['7'], prices: ['1000000000000000000'], beneficiaries: [BUYER] }
    ])
  })

  it('skips the approval when the store allowance is already set', async () => {
    allowanceWei = '1000000000000000000000000'
    await buyMintWithMana({ mint: fakeMint(), buyer: BUYER, signer })

    expect(approveCalls).toHaveLength(0)
    expect(storeBuyCalls).toHaveLength(1)
  })

  /**
   * No caller argument here on purpose: a mint carries the price the contract will verify, so the rail can
   * size its own allowance check. The trade rail cannot (a USD-pegged order is priced by the oracle at
   * settlement), which is why that one is told.
   */
  it('approves again when the leftover allowance is smaller than the mint price', async () => {
    allowanceWei = '999999999999999999' // one wei short of the item's 1 MANA price

    await buyMintWithMana({ mint: fakeMint(), buyer: BUYER, signer })

    expect(approveCalls).toHaveLength(1)
    expect(approveCalls[0].spender).toBe('0xstore')
    expect(storeBuyCalls).toHaveLength(1)
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

  // The gap is the amount the CreditsManager pulls, so an allowance below it is not an allowance for this
  // purchase — useCredits reverts pulling the uncredited leg.
  it('approves again when the leftover allowance is smaller than the MANA gap', async () => {
    allowanceWei = '599'

    await buyWithCreditsAndMana({
      trade: fakeTrade(),
      buyer: BUYER,
      signer,
      credits: [credit('400')],
      manaGapWei: 600n
    })

    expect(approveCalls).toHaveLength(1)
    expect(approveCalls[0].spender).toBe('0xcreditsmanager')
    expect(useCreditsCalls).toHaveLength(1)
  })

  it('refuses a MANA-only purchase (useCredits reverts with NoCredits on an empty credits array)', async () => {
    await expect(
      buyWithCreditsAndMana({ trade: fakeTrade(), buyer: BUYER, signer, credits: [], manaGapWei: 600n })
    ).rejects.toThrow(/MANA-only rail/)
    expect(useCreditsCalls).toHaveLength(0)
    expect(approveCalls).toHaveLength(0)
  })

  it('refuses a zero gap (that is a credits-only purchase, no MANA needed)', async () => {
    await expect(
      buyWithCreditsAndMana({ trade: fakeTrade(), buyer: BUYER, signer, credits: [credit('400')], manaGapWei: 0n })
    ).rejects.toThrow(/credits-only rail/)
    expect(useCreditsCalls).toHaveLength(0)
  })
})

describe('buyMintWithCreditsAndMana (the same mixed rail, for a mint)', () => {
  beforeEach(() => {
    approveCalls.length = 0
    storeBuyCalls.length = 0
    useCreditsCalls.length = 0
    allowanceWei = '0'
  })

  it('approves the CREDITSMANAGER — the mixed rail settles through it whatever is being bought', async () => {
    await buyMintWithCreditsAndMana({
      mint: fakeMint(),
      buyer: BUYER,
      signer,
      credits: [credit('400')],
      manaGapWei: 600n
    })

    expect(approveCalls).toHaveLength(1)
    expect(approveCalls[0].spender).toBe('0xcreditsmanager')
    // Never a direct store call: the CreditsManager makes it, with the MANA gap as its uncredited leg.
    expect(storeBuyCalls).toHaveLength(0)
  })

  it('settles as a STORE purchase, with the same credits + gap cap a trade gets', async () => {
    await buyMintWithCreditsAndMana({
      mint: fakeMint(),
      buyer: BUYER,
      signer,
      credits: [credit('400')],
      manaGapWei: 600n
    })

    expect(useCreditsCalls).toHaveLength(1)
    expect(useCreditsCalls[0].kind).toBe('store')
    expect(useCreditsCalls[0].maxCreditedValue).toBe('1000')
  })
})

/**
 * The mixed rail RELAYS, and what it does when the relay fails.
 *
 * This rail shipped without a relayed path at all — it went straight to the buyer's own transaction while
 * both sibling rails relayed first. Two production failures came out of that in three days, from one buyer
 * on a managed wallet: `insufficient funds ... balance 0` (there is no POL in a managed wallet, ever) and,
 * two days later, a wrong-network refusal for a transaction the relayer would have submitted from any chain.
 *
 * So these cases pin the RAIL CHOICE, not the arithmetic the suites above cover: which path a purchase takes,
 * and — for every way the relay can fail — whether falling back to the buyer's own gas is a route they have.
 */
describe('buyWithCreditsAndMana (relayed rail)', () => {
  beforeEach(() => {
    approveCalls.length = 0
    allowanceWei = '999999999999999999999'
    gaslessState.enabled = true
  })

  const args = (over: Record<string, unknown> = {}) => ({
    trade: fakeTrade(),
    buyer: BUYER,
    signer,
    credits: [credit('400')],
    manaGapWei: 600n,
    providerType: ProviderType.INJECTED,
    ...over
  })

  it('relays the purchase instead of submitting it from the buyer wallet', async () => {
    const hash = await buyWithCreditsAndMana(args())

    expect(buyOneGasless).toHaveBeenCalledTimes(1)
    expect(hash).toBe('0xrelayedhash')
    // The direct rail is the fallback now, not the default — nothing should have reached it.
    expect(useCreditsCalls).toHaveLength(0)
  })

  it('hands the relayed rail the same credits + gap cap the direct one gets', async () => {
    await buyWithCreditsAndMana(args({ credits: [credit('400')], manaGapWei: 600n }))

    expect(gaslessCalls[0].purchase.maxCreditedValue).toBe('1000')
    expect(gaslessCalls[0].buyer).toBe(BUYER)
  })

  it('relays a MINT down the same rail', async () => {
    const hash = await buyMintWithCreditsAndMana({
      mint: fakeMint(),
      buyer: BUYER,
      signer,
      credits: [credit('400')],
      manaGapWei: 600n,
      providerType: ProviderType.INJECTED
    })

    expect(hash).toBe('0xrelayedhash')
    expect(gaslessCalls[0].purchase.kind).toBe('store')
    expect(useCreditsCalls).toHaveLength(0)
  })

  it('reports the broadcast as soon as the relay resolves, and waits for settlement before returning', async () => {
    const broadcast: string[] = []
    const order: string[] = []
    waitForSettlement.mockImplementation(async () => {
      order.push('settled')
    })

    await buyWithCreditsAndMana(
      args({
        onBroadcast: ({ txHash }: { txHash: string }) => {
          broadcast.push(txHash)
          order.push('broadcast')
        }
      })
    )

    // The relayer has already transmitted, so the credits are spoken for before settlement is known.
    expect(broadcast).toEqual(['0xrelayedhash'])
    expect(order).toEqual(['broadcast', 'settled'])
    expect(waitForSettlement).toHaveBeenCalledWith('0xrelayedhash')
  })

  it('still goes direct when gasless is switched off', async () => {
    gaslessState.enabled = false

    const hash = await buyWithCreditsAndMana(args())

    expect(buyOneGasless).not.toHaveBeenCalled()
    expect(hash).toBe('0xcombinedhash')
  })
})

describe('buyWithCreditsAndMana (what happens when the relay fails)', () => {
  beforeEach(() => {
    approveCalls.length = 0
    allowanceWei = '999999999999999999999'
    gaslessState.enabled = true
  })

  const args = (over: Record<string, unknown> = {}) => ({
    trade: fakeTrade(),
    buyer: BUYER,
    signer,
    credits: [credit('400')],
    manaGapWei: 600n,
    providerType: ProviderType.INJECTED,
    ...over
  })

  it('REFUSES the gas-paying fallback to a managed wallet — the failure that reached production', async () => {
    buyOneGasless.mockRejectedValue(new GaslessUnavailableError('relayer said no', 'relayer-rejected'))

    await expect(buyWithCreditsAndMana(args({ providerType: ProviderType.MAGIC }))).rejects.toThrow('relayer said no')
    // Reaching the direct rail is what produced `insufficient funds ... balance 0`: a managed wallet holds
    // no POL, so that transaction cannot succeed and the prompt cannot be acted on.
    expect(useCreditsCalls).toHaveLength(0)
  })

  it('treats an ABSENT providerType as managed, so an un-threaded call site cannot reopen the hole', async () => {
    buyOneGasless.mockRejectedValue(new GaslessUnavailableError('relayer said no', 'relayer-rejected'))

    await expect(buyWithCreditsAndMana(args({ providerType: undefined }))).rejects.toThrow('relayer said no')
    expect(useCreditsCalls).toHaveLength(0)
  })

  it('DOES offer the fallback to a self-custody wallet, which can actually pay the gas', async () => {
    buyOneGasless.mockRejectedValue(new GaslessUnavailableError('relayer said no', 'relayer-rejected'))

    const hash = await buyWithCreditsAndMana(args({ providerType: ProviderType.INJECTED }))

    expect(hash).toBe('0xcombinedhash')
    expect(useCreditsCalls).toHaveLength(1)
  })

  it('propagates a dismissed signature instead of asking again for gas', async () => {
    buyOneGasless.mockRejectedValue(new MetaTransactionError('user denied', ErrorCode.USER_DENIED))

    await expect(buyWithCreditsAndMana(args())).rejects.toThrow('user denied')
    // A cancellation is an answer. Retrying it as a gas-paying transaction is the footgun #347 closed
    // everywhere else.
    expect(useCreditsCalls).toHaveLength(0)
  })

  it('never re-submits a relay whose receipt has not arrived — that would buy the item twice', async () => {
    waitForSettlement.mockRejectedValue(new SettlementPendingError('still pending'))

    await expect(buyWithCreditsAndMana(args())).rejects.toThrow('still pending')
    expect(useCreditsCalls).toHaveLength(0)
  })

  it('marks an unreachable relayer UNOBSERVABLE and does not retry — it may have broadcast already', async () => {
    buyOneGasless.mockRejectedValue(new GaslessUnavailableError('socket hang up', 'relayer-unreachable'))
    const unobservable = vi.fn()

    await expect(buyWithCreditsAndMana(args({ onUnobservable: unobservable }))).rejects.toThrow('socket hang up')
    expect(unobservable).toHaveBeenCalledTimes(1)
    // Even a self-custody wallet gets no fallback here: the same credit could be spent twice.
    expect(useCreditsCalls).toHaveLength(0)
  })

  it('names the reverted attempt so its reservation can be released', async () => {
    waitForSettlement.mockRejectedValue(new Error('transaction reverted'))
    const reverted: Array<string | null> = []

    await expect(
      buyWithCreditsAndMana(args({ onReverted: ({ txHash }: { txHash: string | null }) => reverted.push(txHash) }))
    ).rejects.toThrow('transaction reverted')

    // A revert consumed nothing, so the caller may release — but only if it knows WHICH attempt failed.
    expect(reverted).toEqual(['0xrelayedhash'])
    expect(useCreditsCalls).toHaveLength(0)
  })

  it('does not report a broadcast that never happened', async () => {
    buyOneGasless.mockRejectedValue(new GaslessUnavailableError('relayer said no', 'relayer-rejected'))
    const broadcast: string[] = []

    await buyWithCreditsAndMana(args({ onBroadcast: ({ txHash }: { txHash: string }) => broadcast.push(txHash) }))

    // The relay refused, so the only broadcast is the direct rail's — which reports it itself.
    expect(broadcast).toEqual([])
  })
})
