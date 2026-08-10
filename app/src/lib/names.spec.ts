import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AuthIdentity } from '@dcl/crypto'
import type { ethers } from 'ethers'

// --- Network / dependency seams -------------------------------------------------------------------
// signedFetch (default export) backs the /credits-name-route call; capture it so we can assert the
// URL and feed programmable responses.
const { signedFetch } = vi.hoisted(() => ({ signedFetch: vi.fn() }))
vi.mock('decentraland-crypto-fetch', () => ({ default: signedFetch }))

// Pin the server base URLs so asserted URLs are env-independent.
vi.mock('~/config', () => ({
  config: { creditsServerUrl: 'https://credits.example', chainId: 137 }
}))

// checkNameAvailability reads DCLRegistrar.available on-chain. Stub only ethers.Contract (+ the
// provider ctor) so we can drive `available`; everything else (BigNumber, used by the register tests)
// stays the real implementation.
const availableMock = vi.hoisted(() => vi.fn())
vi.mock('ethers', async importOriginal => {
  const actual = await importOriginal<typeof import('ethers')>()
  return {
    ...actual,
    ethers: {
      ...actual.ethers,
      providers: { ...actual.ethers.providers, JsonRpcProvider: vi.fn(() => ({})) },
      Contract: vi.fn(() => ({ available: availableMock }))
    }
  }
})

// ~/lib/trade-encoding (idToSalt) and ~/lib/mana-rate both pull decentraland-transactions at module
// load; stub it so its ESM/cross-chain deps don't get evaluated. Real ethers stays.
vi.mock('decentraland-transactions', () => ({
  ContractName: {
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
  NameRouteCostTooHighError,
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
