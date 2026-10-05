import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { AuthIdentity } from '@dcl/crypto'
import type { ethers } from 'ethers'
import { WrongNetworkError } from '~/lib/network'

// --- Network / dependency seams -------------------------------------------------------------------
// signedFetch (default export) backs the /credits-name-route call; capture it so we can assert the
// URL and feed programmable responses.
const { signedFetch } = vi.hoisted(() => ({ signedFetch: vi.fn() }))
vi.mock('decentraland-crypto-fetch', () => ({ default: signedFetch }))

// Pin the server base URLs so asserted URLs are env-independent.
// Every chain field the rails read, so a comparison against one of them cannot pass against `undefined`.
vi.mock('~/config', () => ({
  config: {
    creditsServerUrl: 'https://credits.example',
    chainId: 137,
    ethereumChainId: 1,
    rpcUrl: 'https://rpc.example/polygon',
    squidApiUrl: 'https://squid.example'
  }
}))

// checkNameAvailability reads DCLRegistrar.available on-chain. Stub only ethers.Contract (+ the
// provider ctor) so we can drive `available`; everything else (BigNumber, used by the register tests)
// stays the real implementation.
const availableMock = vi.hoisted(() => vi.fn())
// DCLControllerV2.register, for the Ethereum rail. Same stubbed Contract as the registrar read above.
const registerMock = vi.hoisted(() => vi.fn())
// The buyer's native balance on Polygon, which the MANA-alone rail reads to tell whether its fee is payable.
const getBalanceMock = vi.hoisted(() => vi.fn())
const getGasPriceMock = vi.hoisted(() => vi.fn())
// The MANA allowance the router already holds, which decides whether the wallet must also fund an approval.
const allowanceMock = vi.hoisted(() => vi.fn())
vi.mock('ethers', async importOriginal => {
  const actual = await importOriginal<typeof import('ethers')>()
  return {
    ...actual,
    ethers: {
      ...actual.ethers,
      providers: {
        ...actual.ethers.providers,
        JsonRpcProvider: vi.fn(() => ({ getBalance: getBalanceMock, getGasPrice: getGasPriceMock }))
      },
      Contract: vi.fn(() => ({ available: availableMock, register: registerMock, allowance: allowanceMock }))
    }
  }
})

// The cross-chain router the MANA-alone rail rides — the marketplace's own, loaded on demand by the lib.
const squid = vi.hoisted(() => ({
  init: vi.fn(),
  getSupportedTokens: vi.fn(),
  getFromAmount: vi.fn(),
  getRegisterNameRoute: vi.fn(),
  // The SDK underneath, which the lib calls directly for the exact approval and the bridge's hash.
  squid: { executeRoute: vi.fn(), getStatus: vi.fn() }
}))
vi.mock('decentraland-transactions/crossChain', () => ({ AxelarProvider: vi.fn(() => squid) }))

const { captureError } = vi.hoisted(() => ({ captureError: vi.fn() }))
vi.mock('~/lib/monitoring', () => ({ captureError }))

// ~/lib/trade-encoding (idToSalt) and ~/lib/mana-rate both pull decentraland-transactions at module
// load; stub it so its ESM/cross-chain deps don't get evaluated. Real ethers stays.
vi.mock('decentraland-transactions', () => ({
  ContractName: {
    OffChainMarketplaceV3: 'OffChainMarketplaceV3',
    OffChainMarketplaceV2: 'OffChainMarketplaceV2',
    MANAToken: 'MANAToken',
    CreditsManager: 'CreditsManager'
  },
  getContract: () => ({ address: '0x0000000000000000000000000000000000000000', name: 'x', version: '1', abi: [] }),
  getContractName: () => 'DecentralandMarketplacePolygon'
}))

// Keep the REAL (pure) MANA→USD math; stub only the oracle read (network).
const { readManaUsdRate } = vi.hoisted(() => ({ readManaUsdRate: vi.fn() }))
vi.mock('~/lib/mana-rate', async importOriginal => {
  const actual = await importOriginal<typeof import('~/lib/mana-rate')>()
  return { ...actual, readManaUsdRate }
})

// USD credits server calls.
const { authorizeUsdCredit, cancelUsdIntents } = vi.hoisted(() => ({
  authorizeUsdCredit: vi.fn(),
  cancelUsdIntents: vi.fn()
}))
vi.mock('~/lib/credits', () => ({ authorizeUsdCredit, cancelUsdIntents }))

// Buyer-submitted useCredits fallback.
const { sendUseCredits } = vi.hoisted(() => ({ sendUseCredits: vi.fn() }))
vi.mock('~/lib/buy', () => ({ sendUseCredits }))

// The MANA leg's allowance. Mocked wholesale: its real graph reaches the wallet, and what these cases
// assert is WHETHER it is asked for, not how it is granted.
const { ensureAuthorization } = vi.hoisted(() => ({ ensureAuthorization: vi.fn() }))
vi.mock('~/lib/authorizations', () => ({ ensureAuthorization, AuthorizationKind: { Allowance: 'allowance' } }))

// Gasless submit + settlement wait. Fully mock the module (its real graph pulls decentraland-
// transactions' cross-chain ESM) but provide stand-in error classes — names.ts and this spec both
// import them from the SAME mock, so the `instanceof` checks inside names.ts line up.
const { GaslessUnavailableError, SettlementPendingError, sendUseCreditsGasless, waitForSettlement } = vi.hoisted(() => {
  class GaslessUnavailableError extends Error {
    reason: string
    constructor(message: string, reason = 'unknown') {
      super(message)
      this.name = 'GaslessUnavailableError'
      this.reason = reason
    }
  }
  class SettlementPendingError extends Error {
    txHash: string
    constructor(txHash: string) {
      super('Purchase not yet confirmed')
      this.name = 'SettlementPendingError'
      this.txHash = txHash
    }
  }
  return { GaslessUnavailableError, SettlementPendingError, sendUseCreditsGasless: vi.fn(), waitForSettlement: vi.fn() }
})
vi.mock('~/lib/buy-gasless', () => ({
  GaslessUnavailableError,
  SettlementPendingError,
  sendUseCreditsGasless,
  waitForSettlement
}))

import {
  NAME_MAX_LENGTH,
  NAME_PRICE_IN_WEI,
  NameFeeShortError,
  NameInFlightError,
  NameManaShortError,
  NameNotRegisteredError,
  NameQuoteMovedError,
  NameRefundedError,
  NameRouteCostTooHighError,
  NameRouteUnavailableError,
  NameSettlementUnknownError,
  NameTakenError,
  quoteNameWithPolygonMana,
  registerNameWithPolygonMana,
  SQUID_ROUTER,
  buildNameUseCreditsArgs,
  checkNameAvailability,
  fetchNameCreditRoute,
  registerNameWithUsdCredits,
  sanitizeNameInput,
  sizeNameUsdCents,
  validateName,
  type NameCreditRoute
} from '~/lib/names'

const IDENTITY = {} as AuthIdentity
const BUYER = '0xBuyerAddress0000000000000000000000000001'
const SIGNER = { getAddress: async () => BUYER } as unknown as ethers.Signer

// MANA = $0.40 → 100 MANA = $40.00 = 4000 cents (rate has 8 decimals, Chainlink-style).
const RATE_40C = { rate: 40000000n, decimals: 8 }

const ROUTE: NameCreditRoute = {
  externalCall: {
    target: '0xExecutor00000000000000000000000000000001',
    selector: '0xfd165a73',
    data: '0xdeadbeef',
    expiresAt: 1_900_000_000,
    salt: '0x' + '11'.repeat(32)
  },
  customExternalCallSignature: '0xsig',
  quoteId: 'quote-1',
  estimatedRouteDuration: 120,
  fromChainId: '137',
  toChainId: '1',
  provider: 'across'
}

// An ephemeral credit sized to ~102 MANA (100 MANA + the server's 2% cap buffer) ≥ the name price.
function authorized(maxCreditedValue = '102000000000000000000') {
  return {
    credit: {
      id: '0x' + 'ab'.repeat(32),
      amount: maxCreditedValue,
      availableAmount: maxCreditedValue,
      expiresAt: 1_900_000_000,
      signature: '0xcreditsig',
      contract: '0xCreditsManager000000000000000000000000001'
    },
    maxCreditedValue,
    usdCents: 4000,
    oracleRate: '40000000'
  }
}

function ok(json: unknown) {
  return { ok: true, status: 200, json: async () => json, text: async () => JSON.stringify(json) }
}
function fail(status: number, json: unknown = {}) {
  return { ok: false, status, json: async () => json, text: async () => JSON.stringify(json) }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
  // cancelUsdIntents is awaited as `.catch(...)` — always resolve by default.
  cancelUsdIntents.mockResolvedValue(0)
})

describe('sizeNameUsdCents', () => {
  it('should size the reservation at the value of 100 MANA (4000 cents at $0.40/MANA)', () => {
    expect(sizeNameUsdCents(RATE_40C)).toBe(4000)
  })

  it('should round the cents UP so the reservation never sits below the name price', () => {
    // A rate with a sub-cent remainder must round up (4000.0001 → 4001).
    expect(sizeNameUsdCents({ rate: 40000001n, decimals: 8 })).toBe(4001)
  })
})

describe('fetchNameCreditRoute', () => {
  it('should GET /credits-name-route with the name, chainId and provider via signed-fetch', async () => {
    signedFetch.mockResolvedValueOnce(ok(ROUTE))

    const route = await fetchNameCreditRoute(IDENTITY, 'my-name', { provider: 'across' })

    expect(route).toEqual(ROUTE)
    const [url, opts] = signedFetch.mock.calls[0]
    expect(url).toBe('https://credits.example/credits-name-route?name=my-name&chainId=137&provider=across')
    expect(opts).toMatchObject({ method: 'GET', identity: IDENTITY })
  })

  it('should throw NameRouteCostTooHighError on a 503 with code ROUTE_COST_TOO_HIGH', async () => {
    signedFetch.mockResolvedValueOnce(fail(503, { code: 'ROUTE_COST_TOO_HIGH' }))

    await expect(fetchNameCreditRoute(IDENTITY, 'my-name')).rejects.toBeInstanceOf(NameRouteCostTooHighError)
  })

  it('should throw a generic error on any other non-ok response', async () => {
    signedFetch.mockResolvedValueOnce(fail(500))

    await expect(fetchNameCreditRoute(IDENTITY, 'my-name')).rejects.toThrow('fetchNameCreditRoute 500')
  })
})

describe('buildNameUseCreditsArgs', () => {
  it('should pin maxCreditedValue to the 100 MANA name price and carry the route external call', () => {
    const args = buildNameUseCreditsArgs(authorized().credit, ROUTE)

    expect(args.maxCreditedValue).toBe(NAME_PRICE_IN_WEI)
    // Credit (102 MANA) covers the price, so the buyer tops up 0 MANA.
    expect(args.maxUncreditedValue).toBe('0')
    expect(args.credits).toHaveLength(1)
    expect(args.creditsSignatures).toEqual(['0xcreditsig'])
    expect(args.externalCall).toMatchObject({ target: ROUTE.externalCall.target, data: ROUTE.externalCall.data })
    expect(args.customExternalCallSignature).toBe('0xsig')
  })
})

describe('registerNameWithUsdCredits', () => {
  /**
   * The screen shows one message per stage, and the stages last wildly different amounts of time — the
   * bridge leg runs for minutes. Order is the whole contract here: reporting `registering` before the buyer
   * has signed, or leaving it on `awaiting-confirmation` after they did, is exactly the stuck-looking
   * purchase this reports progress to avoid.
   */
  it('should report each stage in order as the purchase advances', async () => {
    readManaUsdRate.mockResolvedValueOnce(RATE_40C)
    signedFetch.mockResolvedValueOnce(ok(ROUTE))
    authorizeUsdCredit.mockResolvedValueOnce(authorized())
    sendUseCreditsGasless.mockResolvedValueOnce('0xorigin')
    waitForSettlement.mockResolvedValueOnce(undefined)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ok({ status: 'filled', fillTx: '0xdest', actionsSucceeded: true }))
    )
    const stages: string[] = []

    await registerNameWithUsdCredits({
      name: 'my-name',
      identity: IDENTITY,
      signer: SIGNER,
      acrossPoll: { intervalMs: 0, maxAttempts: 1 },
      onProgress: s => stages.push(s)
    })

    expect(stages).toEqual(['preparing', 'awaiting-confirmation', 'confirming', 'registering'])
  })

  it('should not report a stage past the point a purchase failed', async () => {
    readManaUsdRate.mockResolvedValueOnce(RATE_40C)
    signedFetch.mockResolvedValueOnce(ok(ROUTE))
    authorizeUsdCredit.mockResolvedValueOnce(authorized())
    sendUseCreditsGasless.mockRejectedValueOnce(new GaslessUnavailableError('off', 'disabled'))
    sendUseCredits.mockRejectedValueOnce(new Error('boom'))
    const stages: string[] = []

    await registerNameWithUsdCredits({
      name: 'my-name',
      identity: IDENTITY,
      signer: SIGNER,
      onProgress: s => stages.push(s)
    }).catch(() => undefined)

    // Submission never succeeded, so the screen must not claim the chain is confirming anything.
    expect(stages).toEqual(['preparing', 'awaiting-confirmation'])
  })

  // Progress is presentation. A caller whose render throws must not take a purchase down with it.
  it('should complete the purchase when the progress callback throws', async () => {
    readManaUsdRate.mockResolvedValueOnce(RATE_40C)
    signedFetch.mockResolvedValueOnce(ok(ROUTE))
    authorizeUsdCredit.mockResolvedValueOnce(authorized())
    sendUseCreditsGasless.mockResolvedValueOnce('0xorigin')
    waitForSettlement.mockResolvedValueOnce(undefined)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ok({ status: 'filled', fillTx: '0xdest', actionsSucceeded: true }))
    )

    const result = await registerNameWithUsdCredits({
      name: 'my-name',
      identity: IDENTITY,
      signer: SIGNER,
      acrossPoll: { intervalMs: 0, maxAttempts: 1 },
      onProgress: () => {
        throw new Error('render blew up')
      }
    })

    expect(result).toEqual({ status: 'registered', originTxHash: '0xorigin', destinationTxHash: '0xdest' })
  })

  it('should size USD from the name price, reserve, submit gasless, and return registered on a filled Across deposit', async () => {
    readManaUsdRate.mockResolvedValueOnce(RATE_40C)
    signedFetch.mockResolvedValueOnce(ok(ROUTE))
    authorizeUsdCredit.mockResolvedValueOnce(authorized())
    sendUseCreditsGasless.mockResolvedValueOnce('0xorigin')
    waitForSettlement.mockResolvedValueOnce(undefined)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ok({ status: 'filled', fillTx: '0xdest', actionsSucceeded: true }))
    )

    const result = await registerNameWithUsdCredits({
      name: 'my-name',
      identity: IDENTITY,
      signer: SIGNER,
      beneficiary: BUYER,
      acrossPoll: { intervalMs: 0, maxAttempts: 1 }
    })

    expect(result).toEqual({ status: 'registered', originTxHash: '0xorigin', destinationTxHash: '0xdest' })
    // Sized to 100 MANA worth of cents (4000) and reserved with no tradeId.
    // The name travels with the reservation: it is the only identity the intent will ever carry, so the
    // buyer's purchase history can name the line instead of showing a generic item.
    expect(authorizeUsdCredit).toHaveBeenCalledWith(IDENTITY, 4000, undefined, undefined, 'my-name')
    // useCredits carried the ephemeral credit + the server's signed route external call.
    const submitted = sendUseCreditsGasless.mock.calls[0][0]
    expect(submitted.args.customExternalCallSignature).toBe('0xsig')
    expect(submitted.args.credits[0].value).toBe('102000000000000000000')
    expect(submitted.args.maxCreditedValue).toBe(NAME_PRICE_IN_WEI)
    expect(cancelUsdIntents).not.toHaveBeenCalled()
  })

  it('should fall back to a buyer-submitted tx when gasless is unavailable', async () => {
    readManaUsdRate.mockResolvedValueOnce(RATE_40C)
    signedFetch.mockResolvedValueOnce(ok(ROUTE))
    authorizeUsdCredit.mockResolvedValueOnce(authorized())
    sendUseCreditsGasless.mockRejectedValueOnce(new GaslessUnavailableError('off', 'disabled'))
    sendUseCredits.mockResolvedValueOnce('0xorigin-fallback')
    waitForSettlement.mockResolvedValueOnce(undefined)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ok({ status: 'filled', fillTx: '0xdest', actionsSucceeded: true }))
    )

    const result = await registerNameWithUsdCredits({
      name: 'my-name',
      identity: IDENTITY,
      signer: SIGNER,
      acrossPoll: { intervalMs: 0, maxAttempts: 1 }
    })

    expect(sendUseCredits).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({ status: 'registered', originTxHash: '0xorigin-fallback' })
  })

  it('should release the reservation and surface a friendly error when submit fails before broadcast', async () => {
    readManaUsdRate.mockResolvedValueOnce(RATE_40C)
    signedFetch.mockResolvedValueOnce(ok(ROUTE))
    authorizeUsdCredit.mockResolvedValueOnce(authorized())
    sendUseCreditsGasless.mockRejectedValueOnce(new GaslessUnavailableError('off', 'disabled'))
    sendUseCredits.mockRejectedValueOnce(new Error('boom'))

    await expect(registerNameWithUsdCredits({ name: 'my-name', identity: IDENTITY, signer: SIGNER })).rejects.toThrow(
      "Couldn't register the name"
    )

    expect(cancelUsdIntents).toHaveBeenCalledWith(IDENTITY, ['0x' + 'ab'.repeat(32)])
  })

  it('should release the reservation when the credit comes back under-sized for the name price', async () => {
    readManaUsdRate.mockResolvedValueOnce(RATE_40C)
    signedFetch.mockResolvedValueOnce(ok(ROUTE))
    // Server sized only 99 MANA — a rate swing left it below the 100 MANA price.
    authorizeUsdCredit.mockResolvedValueOnce(authorized('99000000000000000000'))

    await expect(registerNameWithUsdCredits({ name: 'my-name', identity: IDENTITY, signer: SIGNER })).rejects.toThrow(
      "Couldn't register the name"
    )

    expect(cancelUsdIntents).toHaveBeenCalledWith(IDENTITY, ['0x' + 'ab'.repeat(32)])
    // Never attempted to submit a doomed tx.
    expect(sendUseCreditsGasless).not.toHaveBeenCalled()
  })

  it('should KEEP the reservation and report pending when the origin tx is still in flight', async () => {
    readManaUsdRate.mockResolvedValueOnce(RATE_40C)
    signedFetch.mockResolvedValueOnce(ok(ROUTE))
    authorizeUsdCredit.mockResolvedValueOnce(authorized())
    sendUseCreditsGasless.mockResolvedValueOnce('0xorigin')
    waitForSettlement.mockRejectedValueOnce(new SettlementPendingError('0xorigin'))

    const result = await registerNameWithUsdCredits({ name: 'my-name', identity: IDENTITY, signer: SIGNER })

    expect(result).toEqual({ status: 'pending', originTxHash: '0xorigin' })
    expect(cancelUsdIntents).not.toHaveBeenCalled()
  })

  it('should NOT release the reservation when the origin confirmed but the Across register failed', async () => {
    readManaUsdRate.mockResolvedValueOnce(RATE_40C)
    signedFetch.mockResolvedValueOnce(ok(ROUTE))
    authorizeUsdCredit.mockResolvedValueOnce(authorized())
    sendUseCreditsGasless.mockResolvedValueOnce('0xorigin')
    waitForSettlement.mockResolvedValueOnce(undefined)
    // Deposit filled but the embedded register reverted → MANA went to recovery, NAME not minted.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ok({ status: 'filled', fillTx: '0xdest', actionsSucceeded: false }))
    )

    await expect(
      registerNameWithUsdCredits({
        name: 'my-name',
        identity: IDENTITY,
        signer: SIGNER,
        acrossPoll: { intervalMs: 0, maxAttempts: 1 }
      })
      // Says where the money went, instead of the generic "please try again" the fallback used to
      // substitute — advice that costs a second credit for a failure the buyer cannot retry away.
    ).rejects.toThrow(/funds were recovered/)

    // Credit was consumed on-chain — releasing would be a double-spend, so we must not.
    expect(cancelUsdIntents).not.toHaveBeenCalled()
  })

  /**
   * Across omits `actionsSucceeded` on some filled deposits. The outcome is then UNKNOWN, and the two ways
   * of guessing are both wrong to a buyer: "registered" sends them looking for a NAME that may not exist,
   * "failed" tells them their money was recovered when it may have bought what they asked for.
   */
  it('should report pending when a filled deposit does not report actionsSucceeded', async () => {
    readManaUsdRate.mockResolvedValueOnce(RATE_40C)
    signedFetch.mockResolvedValueOnce(ok(ROUTE))
    authorizeUsdCredit.mockResolvedValueOnce(authorized())
    sendUseCreditsGasless.mockResolvedValueOnce('0xorigin')
    waitForSettlement.mockResolvedValueOnce(undefined)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ok({ status: 'filled', fillTx: '0xdest' }))
    )

    const result = await registerNameWithUsdCredits({
      name: 'my-name',
      identity: IDENTITY,
      signer: SIGNER,
      acrossPoll: { intervalMs: 0, maxAttempts: 1 }
    })

    expect(result).toEqual({ status: 'pending', originTxHash: '0xorigin' })
    // The credit was consumed, so the reservation stays and the reconciler settles it.
    expect(cancelUsdIntents).not.toHaveBeenCalled()
  })

  it('should report pending when a filled deposit reports actionsSucceeded as null', async () => {
    readManaUsdRate.mockResolvedValueOnce(RATE_40C)
    signedFetch.mockResolvedValueOnce(ok(ROUTE))
    authorizeUsdCredit.mockResolvedValueOnce(authorized())
    sendUseCreditsGasless.mockResolvedValueOnce('0xorigin')
    waitForSettlement.mockResolvedValueOnce(undefined)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ok({ status: 'filled', fillTx: '0xdest', actionsSucceeded: null }))
    )

    const result = await registerNameWithUsdCredits({
      name: 'my-name',
      identity: IDENTITY,
      signer: SIGNER,
      acrossPoll: { intervalMs: 0, maxAttempts: 1 }
    })

    expect(result).toEqual({ status: 'pending', originTxHash: '0xorigin' })
  })

  /**
   * The money distinction the relayer's two failure reasons carry. `relayer-unreachable` means no usable
   * response came back and the meta-tx may already be broadcast, so re-submitting the same credit on the
   * direct rail spends it twice from the buyer's side — and releasing the reservation would hand back
   * credits for a registration that then lands.
   */
  it('should not fall back or release the reservation when the relayer is unreachable', async () => {
    readManaUsdRate.mockResolvedValueOnce(RATE_40C)
    signedFetch.mockResolvedValueOnce(ok(ROUTE))
    authorizeUsdCredit.mockResolvedValueOnce(authorized())
    sendUseCreditsGasless.mockRejectedValueOnce(new GaslessUnavailableError('ECONNRESET', 'relayer-unreachable'))

    await expect(
      registerNameWithUsdCredits({
        name: 'my-name',
        identity: IDENTITY,
        signer: SIGNER,
        acrossPoll: { intervalMs: 0, maxAttempts: 1 }
      })
    ).rejects.toThrow()

    expect(sendUseCredits).not.toHaveBeenCalled()
    expect(cancelUsdIntents).not.toHaveBeenCalled()
  })

  /**
   * Typed, not raw. Left as a GaslessUnavailableError it reaches the modal through the generic fallback as
   * "please try again" with an active retry — and a retry is the one action that can genuinely double-spend
   * here, because the first meta-tx may still be in flight, so the name still reads as free and a second
   * credit is authorized against a registration that then lands.
   */
  it('should surface an unreachable relayer as an unknown settlement, not a generic failure', async () => {
    readManaUsdRate.mockResolvedValueOnce(RATE_40C)
    signedFetch.mockResolvedValueOnce(ok(ROUTE))
    authorizeUsdCredit.mockResolvedValueOnce(authorized())
    const cause = new GaslessUnavailableError('ECONNRESET', 'relayer-unreachable')
    sendUseCreditsGasless.mockRejectedValueOnce(cause)

    const thrown = await registerNameWithUsdCredits({
      name: 'my-name',
      identity: IDENTITY,
      signer: SIGNER,
      acrossPoll: { intervalMs: 0, maxAttempts: 1 }
    }).catch((e: unknown) => e)

    expect((thrown as Error).name).toBe('NameSettlementUnknownError')
    expect((thrown as Error).message).not.toMatch(/try again/i)
    // The real failure stays reachable for Sentry behind the buyer-safe copy.
    expect((thrown as Error & { cause?: unknown }).cause).toBe(cause)
  })

  // The counterpart: a REJECTION proves nothing was relayed, so the direct rail is safe and must still run.
  it('should still fall back when the relayer rejected the meta-transaction', async () => {
    readManaUsdRate.mockResolvedValueOnce(RATE_40C)
    signedFetch.mockResolvedValueOnce(ok(ROUTE))
    authorizeUsdCredit.mockResolvedValueOnce(authorized())
    sendUseCreditsGasless.mockRejectedValueOnce(new GaslessUnavailableError('no hash', 'relayer-rejected'))
    sendUseCredits.mockResolvedValueOnce('0xorigin-fallback')
    waitForSettlement.mockResolvedValueOnce(undefined)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ok({ status: 'filled', fillTx: '0xdest', actionsSucceeded: true }))
    )

    const result = await registerNameWithUsdCredits({
      name: 'my-name',
      identity: IDENTITY,
      signer: SIGNER,
      acrossPoll: { intervalMs: 0, maxAttempts: 1 }
    })

    expect(result).toEqual({ status: 'registered', originTxHash: '0xorigin-fallback', destinationTxHash: '0xdest' })
    expect(sendUseCredits).toHaveBeenCalledTimes(1)
  })

  it('should report pending (not failure) when the Across deposit stays unfilled within the window', async () => {
    readManaUsdRate.mockResolvedValueOnce(RATE_40C)
    signedFetch.mockResolvedValueOnce(ok(ROUTE))
    authorizeUsdCredit.mockResolvedValueOnce(authorized())
    sendUseCreditsGasless.mockResolvedValueOnce('0xorigin')
    waitForSettlement.mockResolvedValueOnce(undefined)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ok({ status: 'pending' }))
    )

    const result = await registerNameWithUsdCredits({
      name: 'my-name',
      identity: IDENTITY,
      signer: SIGNER,
      acrossPoll: { intervalMs: 0, maxAttempts: 1 }
    })

    expect(result).toEqual({ status: 'pending', originTxHash: '0xorigin' })
    expect(cancelUsdIntents).not.toHaveBeenCalled()
  })

  it('should propagate NameRouteCostTooHighError without wrapping (and reserve nothing)', async () => {
    readManaUsdRate.mockResolvedValueOnce(RATE_40C)
    signedFetch.mockResolvedValueOnce(fail(503, { code: 'ROUTE_COST_TOO_HIGH' }))

    await expect(
      registerNameWithUsdCredits({ name: 'my-name', identity: IDENTITY, signer: SIGNER })
    ).rejects.toBeInstanceOf(NameRouteCostTooHighError)

    expect(authorizeUsdCredit).not.toHaveBeenCalled()
    expect(cancelUsdIntents).not.toHaveBeenCalled()
  })
})

describe('validateName', () => {
  it('should accept a 2–15 char alphanumeric name', () => {
    expect(validateName('bob')).toEqual({ ok: true })
    expect(validateName('MyName123')).toEqual({ ok: true })
    expect(validateName('a'.repeat(NAME_MAX_LENGTH))).toEqual({ ok: true })
  })

  it('should reject an empty name', () => {
    expect(validateName('   ')).toEqual({ ok: false, reason: 'empty' })
  })

  it('should reject a name shorter than 2 chars', () => {
    expect(validateName('a')).toEqual({ ok: false, reason: 'too-short' })
  })

  it('should reject a name longer than 15 chars', () => {
    expect(validateName('a'.repeat(16))).toEqual({ ok: false, reason: 'too-long' })
  })

  it('should reject spaces and symbols before length', () => {
    expect(validateName('bad name')).toEqual({ ok: false, reason: 'invalid-chars' })
    expect(validateName('hi!')).toEqual({ ok: false, reason: 'invalid-chars' })
    expect(validateName('emoji😀')).toEqual({ ok: false, reason: 'invalid-chars' })
  })
})

describe('sanitizeNameInput', () => {
  it('should strip disallowed characters and spaces', () => {
    expect(sanitizeNameInput('Hello World!')).toBe('HelloWorld')
    expect(sanitizeNameInput('a.b-c_d')).toBe('abcd')
  })

  it('should cap the length at NAME_MAX_LENGTH', () => {
    expect(sanitizeNameInput('a'.repeat(30))).toHaveLength(NAME_MAX_LENGTH)
  })
})

describe('checkNameAvailability', () => {
  beforeEach(() => availableMock.mockReset())

  it('reports available when DCLRegistrar.available returns true', async () => {
    availableMock.mockResolvedValue(true)
    await expect(checkNameAvailability('freeName')).resolves.toBe('available')
    expect(availableMock).toHaveBeenCalledWith('freeName')
  })

  it('reports taken when DCLRegistrar.available returns false', async () => {
    availableMock.mockResolvedValue(false)
    await expect(checkNameAvailability('takenname')).resolves.toBe('taken')
  })

  it('discards a superseded (aborted) check', async () => {
    availableMock.mockResolvedValue(true)
    const ctrl = new AbortController()
    ctrl.abort()
    await expect(checkNameAvailability('bob', { signal: ctrl.signal })).rejects.toThrow(/abort/i)
  })
})

/**
 * Paying part of a NAME with the buyer's own Polygon MANA.
 *
 * The registration cannot leave the CreditsManager — it runs through a server-signed external call only
 * `useCredits` can make — so MANA never replaces the credit, it covers the REMAINDER. The contract pulls
 * that remainder up front as `maxUncreditedValue` and refunds whatever the call did not need.
 */
describe('when the buyer pays part of the NAME with MANA', () => {
  it('should reserve only the credits the buyer chose, not the whole price', async () => {
    readManaUsdRate.mockResolvedValueOnce(RATE_40C)
    signedFetch.mockResolvedValueOnce(ok(ROUTE))
    // Half the 100 MANA price in credits; the rest rides on MANA.
    authorizeUsdCredit.mockResolvedValueOnce(authorized('50000000000000000000'))
    sendUseCreditsGasless.mockResolvedValueOnce('0xorigin')
    waitForSettlement.mockResolvedValueOnce(undefined)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ok({ status: 'filled', fillTx: '0xdest', actionsSucceeded: true }))
    )

    await registerNameWithUsdCredits({
      name: 'my-name',
      identity: IDENTITY,
      signer: SIGNER,
      creditsCents: 2000,
      acrossPoll: { intervalMs: 0, maxAttempts: 1 }
    })

    expect(authorizeUsdCredit.mock.calls[0][1]).toBe(2000)
    // The gap the contract will pull from the wallet: 100 MANA priced, 50 credited.
    const args = sendUseCreditsGasless.mock.calls[0][0].args
    expect(args.maxCreditedValue).toBe(NAME_PRICE_IN_WEI)
    expect(args.maxUncreditedValue).toBe('50000000000000000000')
  })

  // The invariant that guards a credits-only buyer must not fire here: the gap IS the purchase.
  it('should not refuse an under-sized credit when the gap was asked for', async () => {
    readManaUsdRate.mockResolvedValueOnce(RATE_40C)
    signedFetch.mockResolvedValueOnce(ok(ROUTE))
    authorizeUsdCredit.mockResolvedValueOnce(authorized('10000000000000000000'))
    sendUseCreditsGasless.mockResolvedValueOnce('0xorigin')
    waitForSettlement.mockResolvedValueOnce(undefined)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ok({ status: 'filled', fillTx: '0xdest', actionsSucceeded: true }))
    )

    const res = await registerNameWithUsdCredits({
      name: 'my-name',
      identity: IDENTITY,
      signer: SIGNER,
      creditsCents: 400,
      acrossPoll: { intervalMs: 0, maxAttempts: 1 }
    })

    expect(res.status).toBe('registered')
    expect(cancelUsdIntents).not.toHaveBeenCalled()
  })

  /**
   * `useCredits` reverts with `NoCredits()` on an empty credits array, and the credits-server refuses a
   * non-positive `usdPriceCents`. A caller asking for zero would get a 400 and a dead purchase, so the
   * floor is enforced here instead.
   */
  it('should never reserve nothing, however little the caller asks for', async () => {
    readManaUsdRate.mockResolvedValueOnce(RATE_40C)
    signedFetch.mockResolvedValueOnce(ok(ROUTE))
    authorizeUsdCredit.mockResolvedValueOnce(authorized('1000000000000000000'))
    sendUseCreditsGasless.mockResolvedValueOnce('0xorigin')
    waitForSettlement.mockResolvedValueOnce(undefined)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ok({ status: 'filled', fillTx: '0xdest', actionsSucceeded: true }))
    )

    await registerNameWithUsdCredits({
      name: 'my-name',
      identity: IDENTITY,
      signer: SIGNER,
      creditsCents: 0,
      acrossPoll: { intervalMs: 0, maxAttempts: 1 }
    })

    expect(authorizeUsdCredit.mock.calls[0][1]).toBe(1)
  })

  /**
   * `useCredits` pulls the uncredited leg with `safeTransferFrom(buyer, ...)`, which reverts without an
   * allowance — so the approval has to happen BEFORE the submit, not after a failed one.
   */
  it('should let the CreditsManager pull the MANA leg before submitting', async () => {
    readManaUsdRate.mockResolvedValueOnce(RATE_40C)
    signedFetch.mockResolvedValueOnce(ok(ROUTE))
    authorizeUsdCredit.mockResolvedValueOnce(authorized('50000000000000000000'))
    sendUseCreditsGasless.mockResolvedValueOnce('0xorigin')
    waitForSettlement.mockResolvedValueOnce(undefined)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ok({ status: 'filled', fillTx: '0xdest', actionsSucceeded: true }))
    )

    await registerNameWithUsdCredits({
      name: 'my-name',
      identity: IDENTITY,
      signer: SIGNER,
      creditsCents: 2000,
      acrossPoll: { intervalMs: 0, maxAttempts: 1 }
    })

    expect(ensureAuthorization).toHaveBeenCalledTimes(1)
    // Exactly the gap, not the whole price: an allowance is the buyer's money, so ask for what is spent.
    expect(ensureAuthorization.mock.calls[0][0].requiredWei).toBe(50000000000000000000n)
    expect(ensureAuthorization.mock.calls[0][0].auth.kind).toBe('allowance')
  })

  // A credits-only NAME must not start asking for MANA permissions it will never use.
  it('should not ask for a MANA allowance when credits cover the price', async () => {
    readManaUsdRate.mockResolvedValueOnce(RATE_40C)
    signedFetch.mockResolvedValueOnce(ok(ROUTE))
    authorizeUsdCredit.mockResolvedValueOnce(authorized())
    sendUseCreditsGasless.mockResolvedValueOnce('0xorigin')
    waitForSettlement.mockResolvedValueOnce(undefined)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ok({ status: 'filled', fillTx: '0xdest', actionsSucceeded: true }))
    )

    await registerNameWithUsdCredits({
      name: 'my-name',
      identity: IDENTITY,
      signer: SIGNER,
      acrossPoll: { intervalMs: 0, maxAttempts: 1 }
    })

    expect(ensureAuthorization).not.toHaveBeenCalled()
  })

  /**
   * The MANA figure on screen comes from a rate cached for up to a minute; the gap is derived from a fresh
   * read at submit. Without a cap the contract silently pulls the difference — an 11% MANA move turns a
   * screen that said 7.41 into a 15 MANA charge.
   */
  it('should refuse to pull more MANA than the buyer was shown', async () => {
    readManaUsdRate.mockResolvedValueOnce(RATE_40C)
    signedFetch.mockResolvedValueOnce(ok(ROUTE))
    // The credit covers 50 MANA, so the real gap is 50 — far past the 10 the buyer agreed to.
    authorizeUsdCredit.mockResolvedValueOnce(authorized('50000000000000000000'))

    await expect(
      registerNameWithUsdCredits({
        name: 'my-name',
        identity: IDENTITY,
        signer: SIGNER,
        creditsCents: 2000,
        maxManaWei: 10n * 10n ** 18n,
        acrossPoll: { intervalMs: 0, maxAttempts: 1 }
      })
    ).rejects.toThrow()

    // Nothing was submitted, and the dollars went back.
    expect(sendUseCreditsGasless).not.toHaveBeenCalled()
    expect(cancelUsdIntents).toHaveBeenCalled()
  })

  it('should go through when the gap is within what was agreed', async () => {
    readManaUsdRate.mockResolvedValueOnce(RATE_40C)
    signedFetch.mockResolvedValueOnce(ok(ROUTE))
    authorizeUsdCredit.mockResolvedValueOnce(authorized('50000000000000000000'))
    sendUseCreditsGasless.mockResolvedValueOnce('0xorigin')
    waitForSettlement.mockResolvedValueOnce(undefined)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ok({ status: 'filled', fillTx: '0xdest', actionsSucceeded: true }))
    )

    const res = await registerNameWithUsdCredits({
      name: 'my-name',
      identity: IDENTITY,
      signer: SIGNER,
      creditsCents: 2000,
      maxManaWei: 60n * 10n ** 18n,
      acrossPoll: { intervalMs: 0, maxAttempts: 1 }
    })

    expect(res.status).toBe('registered')
  })

  // Asking for more than the price would reserve dollars the purchase cannot spend.
  it('should cap the reservation at the full price', async () => {
    readManaUsdRate.mockResolvedValueOnce(RATE_40C)
    signedFetch.mockResolvedValueOnce(ok(ROUTE))
    authorizeUsdCredit.mockResolvedValueOnce(authorized())
    sendUseCreditsGasless.mockResolvedValueOnce('0xorigin')
    waitForSettlement.mockResolvedValueOnce(undefined)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ok({ status: 'filled', fillTx: '0xdest', actionsSucceeded: true }))
    )

    await registerNameWithUsdCredits({
      name: 'my-name',
      identity: IDENTITY,
      signer: SIGNER,
      creditsCents: 999_999,
      acrossPoll: { intervalMs: 0, maxAttempts: 1 }
    })

    expect(authorizeUsdCredit.mock.calls[0][1]).toBe(4000)
  })
})

/**
 * A NAME paid in Polygon MANA alone, through the marketplace's own cross-chain route: the buyer's wallet
 * approves and sends a Squid route that bridges the MANA to Ethereum and registers the NAME there.
 */
const MANA = (n: number) => BigInt(n) * 10n ** 18n
const NATIVE = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'
const ZERO = '0x0000000000000000000000000000000000000000'
const ROUTER = SQUID_ROUTER
// value 0.5 + gasLimit 500k × maxFee 100 gwei (0.05) = what the wallet must hold for the bridge alone.
const BRIDGE_RESERVE = 5n * 10n ** 17n + 500_000n * 100_000_000_000n

function squidRoute() {
  return {
    requestId: 'req-1',
    route: {
      quoteId: 'quote-1',
      // The route raised the amount past the first estimate, so the quote must read it from here.
      params: { fromAmount: MANA(102).toString(), fromToken: ZERO, fromChain: '137' },
      estimate: {
        gasCosts: [{ amount: '300000000000000000', token: { address: NATIVE } }],
        feeCosts: [
          { amount: '200000000000000000', token: { address: NATIVE } },
          // Taken out of the bridged MANA, so already inside fromAmount.
          { amount: '1000000000000000000', token: { address: ZERO } }
        ]
      },
      transactionRequest: {
        target: ROUTER,
        value: '500000000000000000',
        gasLimit: '500000',
        maxFeePerGas: '100000000000'
      }
    }
  }
}

function primeSquid() {
  squid.getSupportedTokens.mockReturnValue([
    { chainId: '137', address: ZERO, decimals: 18, symbol: 'MANA' },
    { chainId: '1', address: ZERO, decimals: 18, symbol: 'MANA' },
    { chainId: '137', address: NATIVE.toLowerCase(), decimals: 18, symbol: 'POL', usdPrice: 0.5 }
  ])
  squid.getFromAmount.mockResolvedValue('101.5')
  squid.getRegisterNameRoute.mockResolvedValue(squidRoute())
  getBalanceMock.mockResolvedValue({ toString: () => MANA(2).toString() })
  getGasPriceMock.mockResolvedValue({ toString: () => '30000000000' })
  allowanceMock.mockResolvedValue({ toString: () => MANA(1000).toString() })
}

function resetSquid() {
  for (const fn of [squid.init, squid.getSupportedTokens, squid.getFromAmount, squid.getRegisterNameRoute])
    fn.mockReset()
  squid.squid.executeRoute.mockReset()
  squid.squid.getStatus.mockReset()
  for (const fn of [getBalanceMock, getGasPriceMock, allowanceMock, availableMock, captureError]) fn.mockReset()
}

describe('when a NAME is quoted in Polygon MANA alone', () => {
  beforeEach(() => {
    primeSquid()
  })

  afterEach(() => {
    resetSquid()
  })

  it('should ask for the route at the amount the first estimate says delivers the price', async () => {
    await quoteNameWithPolygonMana({ name: 'my-name', buyer: BUYER })

    expect(squid.getRegisterNameRoute).toHaveBeenCalledWith({
      name: 'my-name',
      fromAddress: BUYER,
      fromAmount: '101500000000000000000',
      fromChain: 137,
      fromToken: ZERO,
      toAmount: NAME_PRICE_IN_WEI,
      toChain: 1
    })
  })

  it('should quote what the route pulls, its native fees alone, and that fee in dollars', async () => {
    const quote = await quoteNameWithPolygonMana({ name: 'my-name', buyer: BUYER })

    expect({ mana: quote.manaWei, fee: quote.feeWei, usd: quote.feeUsd, native: quote.nativeBalanceWei }).toEqual({
      mana: MANA(102),
      fee: 500000000000000000n,
      usd: 0.25,
      native: MANA(2)
    })
  })

  // A wallet refuses on the reserve it must hold, not on what is finally spent.
  it('should require the value the route carries plus the gas its transaction reserves', async () => {
    const quote = await quoteNameWithPolygonMana({ name: 'my-name', buyer: BUYER })

    expect(quote.requiredNativeWei).toBe(BRIDGE_RESERVE)
  })

  describe('and the router does not yet hold an allowance for the MANA', () => {
    beforeEach(() => {
      allowanceMock.mockResolvedValue({ toString: () => '0' })
    })

    // The router sends the approval with the bridge's own gas limit, so the wallet must cover both.
    it('should require the gas for the approval as well', async () => {
      const quote = await quoteNameWithPolygonMana({ name: 'my-name', buyer: BUYER })

      expect(quote.requiredNativeWei).toBe(BRIDGE_RESERVE + 500_000n * 100_000_000_000n)
    })
  })

  // Every one of these is the API's to choose, and the buyer is about to approve and send it.
  describe.each([
    ['names another router', { transactionRequest: { ...squidRoute().route.transactionRequest, target: ZERO } }],
    ['pulls another token', { params: { ...squidRoute().route.params, fromToken: NATIVE } }],
    ['starts on another chain', { params: { ...squidRoute().route.params, fromChain: '1' } }],
    [
      'pulls more MANA than a NAME can need',
      { params: { ...squidRoute().route.params, fromAmount: MANA(108).toString() } }
    ],
    [
      'carries more native value than any fee could be',
      { transactionRequest: { ...squidRoute().route.transactionRequest, value: MANA(1001).toString() } }
    ]
  ])('and the route %s', (_label, change) => {
    beforeEach(() => {
      squid.getRegisterNameRoute.mockResolvedValue({ ...squidRoute(), route: { ...squidRoute().route, ...change } })
    })

    it('should refuse it as unavailable, and report it', async () => {
      await expect(quoteNameWithPolygonMana({ name: 'my-name', buyer: BUYER })).rejects.toBeInstanceOf(
        NameRouteUnavailableError
      )
      expect(captureError).toHaveBeenCalledTimes(1)
    })
  })

  // The screen never shows a fee below what the transaction actually carries.
  describe('and the route carries more native value than its own estimate', () => {
    beforeEach(() => {
      squid.getRegisterNameRoute.mockResolvedValue({
        ...squidRoute(),
        route: {
          ...squidRoute().route,
          transactionRequest: { ...squidRoute().route.transactionRequest, value: MANA(3).toString() }
        }
      })
    })

    it('should quote the value as the fee', async () => {
      const quote = await quoteNameWithPolygonMana({ name: 'my-name', buyer: BUYER })

      expect(quote.feeWei).toBe(MANA(3))
    })
  })

  describe('and MANA cannot be routed between the two chains', () => {
    beforeEach(() => {
      squid.getSupportedTokens.mockReturnValue([{ chainId: '137', address: ZERO, decimals: 18, symbol: 'MANA' }])
    })

    it('should report the route as unavailable', async () => {
      await expect(quoteNameWithPolygonMana({ name: 'my-name', buyer: BUYER })).rejects.toBeInstanceOf(
        NameRouteUnavailableError
      )
    })
  })

  describe('and the router cannot build a route', () => {
    beforeEach(() => {
      squid.getRegisterNameRoute.mockRejectedValue(new Error('InsufficientLiquidityError'))
    })

    it('should report the route as unavailable', async () => {
      await expect(quoteNameWithPolygonMana({ name: 'my-name', buyer: BUYER })).rejects.toBeInstanceOf(
        NameRouteUnavailableError
      )
    })
  })
})

describe('when a NAME is paid in Polygon MANA alone', () => {
  // A self-custody wallet on Polygon, as the real requireChain asks it.
  let chainIdHex: string
  let wait: ReturnType<typeof vi.fn>
  const web3 = {
    send: vi.fn(async (method: string) => (method === 'eth_chainId' ? chainIdHex : null))
  } as unknown as ethers.providers.Web3Provider
  const sendTransaction = vi.fn()
  const signer = { getAddress: async () => BUYER, sendTransaction } as unknown as ethers.providers.JsonRpcSigner
  const run = (
    opts: { providerType?: string; shownManaWei?: bigint; shownFeeWei?: bigint; waitTimeoutMs?: number } = {}
  ) =>
    registerNameWithPolygonMana({
      name: 'my-name',
      signer,
      web3Provider: web3,
      providerType: opts.providerType ?? 'injected',
      shownManaWei: opts.shownManaWei ?? MANA(102),
      shownFeeWei: opts.shownFeeWei ?? 500000000000000000n,
      statusPoll: { intervalMs: 0, maxAttempts: 2 },
      waitTimeoutMs: opts.waitTimeoutMs
    })

  beforeEach(() => {
    localStorage.clear()
    chainIdHex = '0x89'
    primeSquid()
    availableMock.mockResolvedValue(true)
    wait = vi.fn(async () => ({ status: 1, transactionHash: '0xbridge' }))
    squid.squid.executeRoute.mockResolvedValue({ hash: '0xbridge', wait })
    squid.squid.getStatus.mockResolvedValue({ squidTransactionStatus: 'success' })
  })

  afterEach(() => {
    resetSquid()
  })

  // The marketplace's call, with the approval held to the amount rather than left unlimited to the router.
  it('should send the quoted route from the buyer’s own wallet with an exact approval', async () => {
    await run()

    const call = squid.squid.executeRoute.mock.calls[0][0]
    expect({
      route: call.route,
      settings: call.executionSettings,
      fromBuyersWallet: Object.getPrototypeOf(call.signer) === signer
    }).toEqual({ route: squidRoute().route, settings: { infiniteApproval: false }, fromBuyersWallet: true })
  })

  it('should report the NAME registered, with what the route pulled', async () => {
    await expect(run()).resolves.toEqual({
      status: 'registered',
      originTxHash: '0xbridge',
      destinationTxHash: null,
      manaWei: MANA(102)
    })
  })

  it('should ask the router about the bridge with the chains and the quote beside the transaction', async () => {
    await run()

    expect(squid.squid.getStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        transactionId: '0xbridge',
        requestId: 'req-1',
        fromChainId: '137',
        toChainId: '1',
        quoteId: 'quote-1'
      })
    )
  })

  describe('and the wallet cannot pay its own fees', () => {
    it('should refuse before sending anything', async () => {
      await expect(run({ providerType: 'magic' })).rejects.toThrow()

      expect(squid.squid.executeRoute).not.toHaveBeenCalled()
    })
  })

  describe('and the wallet is on another chain', () => {
    beforeEach(() => {
      chainIdHex = '0x1'
    })

    // Unwrapped, so the modal can offer the switch that fixes it.
    it('should refuse with the wrong-network error itself, before quoting', async () => {
      await expect(run()).rejects.toBeInstanceOf(WrongNetworkError)

      expect(squid.getRegisterNameRoute).not.toHaveBeenCalled()
    })
  })

  describe('and the fresh route needs more MANA than the buyer was shown', () => {
    it('should refuse without sending anything', async () => {
      await expect(run({ shownManaWei: MANA(101) })).rejects.toBeInstanceOf(NameQuoteMovedError)

      expect(squid.squid.executeRoute).not.toHaveBeenCalled()
    })
  })

  describe('and the fresh route charges well past the fee the buyer was shown', () => {
    it('should refuse without sending anything', async () => {
      await expect(run({ shownFeeWei: 300000000000000000n })).rejects.toBeInstanceOf(NameQuoteMovedError)

      expect(squid.squid.executeRoute).not.toHaveBeenCalled()
    })
  })

  // A register that reverts on Ethereum leaves the bridged MANA wherever the router's fallback sends it.
  describe('and somebody registered the NAME since it was searched', () => {
    beforeEach(() => {
      availableMock.mockResolvedValue(false)
    })

    it('should refuse before sending anything', async () => {
      await expect(run()).rejects.toBeInstanceOf(NameTakenError)

      expect(squid.squid.executeRoute).not.toHaveBeenCalled()
    })
  })

  // The NAME reads as free until the first bridge lands, so only this browser can tell it is already paid for.
  describe('and a bridge for the same NAME is still on its way', () => {
    beforeEach(() => {
      squid.squid.getStatus.mockResolvedValue({ squidTransactionStatus: 'ongoing' })
    })

    it('should refuse to pay for it a second time', async () => {
      await run()

      await expect(run()).rejects.toBeInstanceOf(NameInFlightError)
    })
  })

  describe('and the previous bridge for the NAME settled', () => {
    it('should let it be bought again', async () => {
      await run()

      await expect(run()).resolves.toMatchObject({ status: 'registered' })
    })
  })

  describe('and the bridge gives the payment back', () => {
    beforeEach(() => {
      squid.squid.getStatus.mockResolvedValue({ squidTransactionStatus: 'refund' })
    })

    it('should say the payment was refunded', async () => {
      await expect(run()).rejects.toBeInstanceOf(NameRefundedError)
    })
  })

  describe('and the bridge delivered but the registration failed', () => {
    beforeEach(() => {
      squid.squid.getStatus.mockResolvedValue({ squidTransactionStatus: 'partial_success' })
    })

    it('should say the NAME was not registered', async () => {
      await expect(run()).rejects.toBeInstanceOf(NameNotRegisteredError)
    })
  })

  describe('and the bridge is still on its way when the wait runs out', () => {
    beforeEach(() => {
      squid.squid.getStatus.mockResolvedValue({ squidTransactionStatus: 'ongoing' })
    })

    it('should report the purchase pending', async () => {
      await expect(run()).resolves.toMatchObject({ status: 'pending', originTxHash: '0xbridge' })
    })
  })

  // Nobody may add the gas it is waiting on, so "it will finish" is not something the screen can say.
  describe('and the bridge is still waiting on gas when the wait runs out', () => {
    beforeEach(() => {
      squid.squid.getStatus.mockResolvedValue({ squidTransactionStatus: 'needs_gas' })
    })

    it('should report the outcome as unknown', async () => {
      await expect(run()).rejects.toBeInstanceOf(NameSettlementUnknownError)
    })
  })

  describe('and the status API fails before it answers', () => {
    beforeEach(() => {
      squid.squid.getStatus
        .mockRejectedValueOnce(new Error('502'))
        .mockResolvedValue({ squidTransactionStatus: 'success' })
    })

    it('should keep asking, and report the failure once', async () => {
      await expect(run()).resolves.toMatchObject({ status: 'registered' })

      expect(captureError).toHaveBeenCalledTimes(1)
    })
  })

  describe('and the buyer sped the bridge up and the replacement mined', () => {
    beforeEach(() => {
      wait.mockRejectedValue(
        Object.assign(new Error('transaction was replaced (cancelled=false)'), {
          code: 'TRANSACTION_REPLACED',
          cancelled: false,
          receipt: { status: 1, transactionHash: '0xspedup' }
        })
      )
    })

    it('should carry on with the replacement as the purchase', async () => {
      await expect(run()).resolves.toMatchObject({ status: 'registered', originTxHash: '0xspedup' })
    })
  })

  describe("and the wallet's own cancel replaced the bridge", () => {
    beforeEach(() => {
      wait.mockRejectedValueOnce(
        Object.assign(new Error('transaction was replaced (cancelled=true)'), {
          code: 'TRANSACTION_REPLACED',
          cancelled: true,
          receipt: { status: 1, transactionHash: '0xcancel' }
        })
      )
    })

    it('should fail as one a retry may follow, and not hold the NAME as in flight', async () => {
      const thrown = await run().catch((e: unknown) => e)

      expect({ unknown: thrown instanceof NameSettlementUnknownError, again: await run().then(r => r.status) }).toEqual(
        {
          unknown: false,
          again: 'registered'
        }
      )
    })
  })

  // Sent, and then lost sight of — but the hash is known, so the bridge itself can still be asked.
  describe('and the wait fails for a reason that says nothing about the bridge', () => {
    beforeEach(() => {
      wait.mockRejectedValue(new Error('network timeout'))
    })

    it('should still report the NAME registered when the bridge says it landed', async () => {
      await expect(run()).resolves.toMatchObject({ status: 'registered', originTxHash: '0xbridge' })
    })

    describe('and the bridge cannot say yet', () => {
      beforeEach(() => {
        squid.squid.getStatus.mockResolvedValue({ squidTransactionStatus: 'not_found' })
      })

      it('should report the outcome as unknown rather than offer a retry', async () => {
        await expect(run()).rejects.toBeInstanceOf(NameSettlementUnknownError)
      })
    })
  })

  // Thrown before the router returned the bridge, so nothing was bridged.
  describe('and the router refuses for want of MANA', () => {
    beforeEach(() => {
      squid.squid.executeRoute.mockRejectedValue(new Error('Insufficient funds for account: 0x on chain 137'))
    })

    it('should say the balance does not cover the NAME', async () => {
      await expect(run()).rejects.toBeInstanceOf(NameManaShortError)
    })
  })

  describe('and the wallet refuses for want of the fee', () => {
    beforeEach(() => {
      squid.squid.executeRoute.mockRejectedValue(
        Object.assign(new Error('insufficient funds for intrinsic transaction cost'), { code: 'INSUFFICIENT_FUNDS' })
      )
    })

    it('should say the balance does not cover the fee', async () => {
      await expect(run()).rejects.toBeInstanceOf(NameFeeShortError)
    })
  })

  describe('and the buyer sped the approval up, so the bridge was never sent', () => {
    beforeEach(() => {
      squid.squid.executeRoute.mockRejectedValue(
        Object.assign(new Error('transaction was replaced (cancelled=false)'), {
          code: 'TRANSACTION_REPLACED',
          cancelled: false,
          receipt: { status: 1, transactionHash: '0xapproval' }
        })
      )
    })

    it('should fail with a retryable message rather than claim the buyer cancelled', async () => {
      const thrown = (await run().catch((e: unknown) => e)) as Error

      expect({
        unknown: thrown instanceof NameSettlementUnknownError,
        cancelled: /cancel/i.test(thrown.message)
      }).toEqual({ unknown: false, cancelled: false })
    })
  })

  describe('and the route drifted up within the half-percent it is allowed', () => {
    it('should go ahead', async () => {
      await expect(run({ shownManaWei: (MANA(102) * 1000n) / 1004n })).resolves.toMatchObject({ status: 'registered' })
    })
  })

  // ethers broadcasts, then polls for the transaction; a failed poll throws with the hash of what already left.
  describe('and the wallet lost track of the bridge right after sending it', () => {
    beforeEach(() => {
      sendTransaction.mockRejectedValue(
        Object.assign(new Error('failed to get transaction'), { transactionHash: '0xout' })
      )
      squid.squid.executeRoute.mockImplementation(async ({ signer: sender }: { signer: ethers.Signer }) => {
        await sender.sendTransaction({ to: SQUID_ROUTER })
      })
    })

    it('should follow the bridge it sent instead of offering a retry', async () => {
      await expect(run()).resolves.toMatchObject({ status: 'registered', originTxHash: '0xout' })
    })

    it('should hold the NAME as in flight while it does', async () => {
      squid.squid.getStatus.mockResolvedValue({ squidTransactionStatus: 'ongoing' })
      await run().catch(() => undefined)

      await expect(run()).rejects.toBeInstanceOf(NameInFlightError)
    })
  })

  describe('and the wallet lost track of the approval, so the bridge never left', () => {
    beforeEach(() => {
      sendTransaction.mockRejectedValue(
        Object.assign(new Error('failed to get transaction'), { transactionHash: '0xapproval' })
      )
      squid.squid.executeRoute.mockImplementation(async ({ signer: sender }: { signer: ethers.Signer }) => {
        await sender.sendTransaction({ to: ZERO })
      })
    })

    it('should fail as one a retry may follow', async () => {
      const thrown = await run().catch((e: unknown) => e)

      expect(thrown instanceof NameSettlementUnknownError).toBe(false)
    })
  })

  describe('and the bridge never confirms within the wait', () => {
    beforeEach(() => {
      wait.mockImplementation(() => new Promise(() => {}))
    })

    it('should stop waiting and ask the bridge', async () => {
      await expect(run({ waitTimeoutMs: 1 })).resolves.toMatchObject({ status: 'registered', originTxHash: '0xbridge' })
    })
  })

  // No answer ever came back, which is not the same as "on its way".
  describe('and the bridge status can never be read', () => {
    beforeEach(() => {
      squid.squid.getStatus.mockRejectedValue(new Error('404'))
    })

    it('should report the outcome as unknown', async () => {
      await expect(run()).rejects.toBeInstanceOf(NameSettlementUnknownError)
    })
  })

  describe('and the router has never seen the bridge', () => {
    beforeEach(() => {
      squid.squid.getStatus.mockResolvedValue({ squidTransactionStatus: 'not_found' })
    })

    it('should report the outcome as unknown', async () => {
      await expect(run()).rejects.toBeInstanceOf(NameSettlementUnknownError)
    })
  })

  // Two tabs sitting on their wallet prompts at once: the second must not get as far as its own.
  describe('and another attempt is still at the wallet prompts', () => {
    beforeEach(() => {
      squid.squid.executeRoute.mockImplementation(() => new Promise(() => {}))
    })

    it('should refuse to start a second one', async () => {
      void run()
      await vi.waitFor(() => expect(squid.squid.executeRoute).toHaveBeenCalled())

      await expect(run()).rejects.toBeInstanceOf(NameInFlightError)
    })
  })

  // A tab closed on its wallet prompts must not lock the NAME for hours.
  describe('and an earlier attempt was abandoned at the wallet prompts long ago', () => {
    beforeEach(() => {
      localStorage.setItem(
        'dcl_shop_names_in_flight',
        JSON.stringify({ 'my-name': { at: Date.now() - 11 * 60 * 1000, phase: 'sending' } })
      )
    })

    it('should let it be bought', async () => {
      await expect(run()).resolves.toMatchObject({ status: 'registered' })
    })
  })

  describe('and the buyer rejects the request', () => {
    beforeEach(() => {
      squid.squid.executeRoute.mockRejectedValue(
        Object.assign(new Error('user rejected transaction'), { code: 'ACTION_REJECTED' })
      )
    })

    it('should fail as a rejection a retry may follow', async () => {
      const thrown = await run().catch((e: unknown) => e)

      expect(thrown instanceof NameSettlementUnknownError).toBe(false)
    })
  })
})

describe('when the cross-chain module fails to load', () => {
  afterEach(() => {
    resetSquid()
  })

  it('should try again on the next quote instead of keeping the failure', async () => {
    vi.resetModules()
    const crossChainModule = await import('decentraland-transactions/crossChain')
    const ctor = vi.mocked(crossChainModule.AxelarProvider)
    ctor.mockImplementationOnce(() => {
      throw new Error('chunk failed to load')
    })
    const fresh = await import('~/lib/names')
    primeSquid()

    await expect(fresh.quoteNameWithPolygonMana({ name: 'my-name', buyer: BUYER })).rejects.toBeInstanceOf(
      fresh.NameRouteUnavailableError
    )
    await expect(fresh.quoteNameWithPolygonMana({ name: 'my-name', buyer: BUYER })).resolves.toMatchObject({
      manaWei: MANA(102)
    })
  })
})
