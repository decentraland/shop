import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AuthIdentity } from '@dcl/crypto'
import type { ethers } from 'ethers'

// --- Network / dependency seams -------------------------------------------------------------------
// signedFetch (default export) backs the /credits-name-route call; capture it so we can assert the
// URL and feed programmable responses.
const { signedFetch } = vi.hoisted(() => ({ signedFetch: vi.fn() }))
vi.mock('decentraland-crypto-fetch', () => ({ default: signedFetch }))

// Pin the credits-server base URL so asserted URLs are env-independent.
vi.mock('~/config', () => ({ config: { creditsServerUrl: 'https://credits.example' } }))

// ~/lib/trade-encoding (idToSalt) and ~/lib/mana-rate both pull decentraland-transactions at module
// load; stub it so its ESM/cross-chain deps don't get evaluated. Real ethers stays.
vi.mock('decentraland-transactions', () => ({
  ContractName: { OffChainMarketplaceV2: 'OffChainMarketplaceV2', MANAToken: 'MANAToken', CreditsManager: 'CreditsManager' },
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
const { GaslessUnavailableError, SettlementPendingError, useCreditsGasless, waitForSettlement } = vi.hoisted(() => {
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
  return { GaslessUnavailableError, SettlementPendingError, useCreditsGasless: vi.fn(), waitForSettlement: vi.fn() }
})
vi.mock('~/lib/buy-gasless', () => ({ GaslessUnavailableError, SettlementPendingError, useCreditsGasless, waitForSettlement }))

import {
  NAME_PRICE_IN_WEI,
  NameRouteCostTooHighError,
  buildNameUseCreditsArgs,
  fetchNameCreditRoute,
  registerNameWithUsdCredits,
  sizeNameUsdCents,
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
  it('should size USD from the name price, reserve, submit gasless, and return registered on a filled Across deposit', async () => {
    readManaUsdRate.mockResolvedValueOnce(RATE_40C)
    signedFetch.mockResolvedValueOnce(ok(ROUTE))
    authorizeUsdCredit.mockResolvedValueOnce(authorized())
    useCreditsGasless.mockResolvedValueOnce('0xorigin')
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
    expect(authorizeUsdCredit).toHaveBeenCalledWith(IDENTITY, 4000)
    // useCredits carried the ephemeral credit + the server's signed route external call.
    const submitted = useCreditsGasless.mock.calls[0][0]
    expect(submitted.args.customExternalCallSignature).toBe('0xsig')
    expect(submitted.args.credits[0].value).toBe('102000000000000000000')
    expect(submitted.args.maxCreditedValue).toBe(NAME_PRICE_IN_WEI)
    expect(cancelUsdIntents).not.toHaveBeenCalled()
  })

  it('should fall back to a buyer-submitted tx when gasless is unavailable', async () => {
    readManaUsdRate.mockResolvedValueOnce(RATE_40C)
    signedFetch.mockResolvedValueOnce(ok(ROUTE))
    authorizeUsdCredit.mockResolvedValueOnce(authorized())
    useCreditsGasless.mockRejectedValueOnce(new GaslessUnavailableError('off', 'disabled'))
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
    useCreditsGasless.mockRejectedValueOnce(new GaslessUnavailableError('off', 'disabled'))
    sendUseCredits.mockRejectedValueOnce(new Error('boom'))

    await expect(
      registerNameWithUsdCredits({ name: 'my-name', identity: IDENTITY, signer: SIGNER })
    ).rejects.toThrow("Couldn't register the name")

    expect(cancelUsdIntents).toHaveBeenCalledWith(IDENTITY, ['0x' + 'ab'.repeat(32)])
  })

  it('should release the reservation when the credit comes back under-sized for the name price', async () => {
    readManaUsdRate.mockResolvedValueOnce(RATE_40C)
    signedFetch.mockResolvedValueOnce(ok(ROUTE))
    // Server sized only 99 MANA — a rate swing left it below the 100 MANA price.
    authorizeUsdCredit.mockResolvedValueOnce(authorized('99000000000000000000'))

    await expect(
      registerNameWithUsdCredits({ name: 'my-name', identity: IDENTITY, signer: SIGNER })
    ).rejects.toThrow("Couldn't register the name")

    expect(cancelUsdIntents).toHaveBeenCalledWith(IDENTITY, ['0x' + 'ab'.repeat(32)])
    // Never attempted to submit a doomed tx.
    expect(useCreditsGasless).not.toHaveBeenCalled()
  })

  it('should KEEP the reservation and report pending when the origin tx is still in flight', async () => {
    readManaUsdRate.mockResolvedValueOnce(RATE_40C)
    signedFetch.mockResolvedValueOnce(ok(ROUTE))
    authorizeUsdCredit.mockResolvedValueOnce(authorized())
    useCreditsGasless.mockResolvedValueOnce('0xorigin')
    waitForSettlement.mockRejectedValueOnce(new SettlementPendingError('0xorigin'))

    const result = await registerNameWithUsdCredits({ name: 'my-name', identity: IDENTITY, signer: SIGNER })

    expect(result).toEqual({ status: 'pending', originTxHash: '0xorigin' })
    expect(cancelUsdIntents).not.toHaveBeenCalled()
  })

  it('should NOT release the reservation when the origin confirmed but the Across register failed', async () => {
    readManaUsdRate.mockResolvedValueOnce(RATE_40C)
    signedFetch.mockResolvedValueOnce(ok(ROUTE))
    authorizeUsdCredit.mockResolvedValueOnce(authorized())
    useCreditsGasless.mockResolvedValueOnce('0xorigin')
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
    ).rejects.toThrow("Couldn't register the name")

    // Credit was consumed on-chain — releasing would be a double-spend, so we must not.
    expect(cancelUsdIntents).not.toHaveBeenCalled()
  })

  it('should report pending (not failure) when the Across deposit stays unfilled within the window', async () => {
    readManaUsdRate.mockResolvedValueOnce(RATE_40C)
    signedFetch.mockResolvedValueOnce(ok(ROUTE))
    authorizeUsdCredit.mockResolvedValueOnce(authorized())
    useCreditsGasless.mockResolvedValueOnce('0xorigin')
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
