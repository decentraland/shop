import { describe, it, expect, beforeEach, vi } from 'vitest'
import { TradeAssetType, type Trade } from '@dcl/schemas'
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
