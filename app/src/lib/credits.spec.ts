import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AuthIdentity } from '@dcl/crypto'

// signedFetch is the default export of decentraland-crypto-fetch; capture every call so we can
// assert URL / method / body without hitting the network. vi.hoisted keeps the fn defined before
// the hoisted vi.mock factory runs.
const { signedFetch } = vi.hoisted(() => ({ signedFetch: vi.fn() }))
vi.mock('decentraland-crypto-fetch', () => ({ default: signedFetch }))

// Pin the credits-server base URL so the asserted URLs are stable regardless of env.
vi.mock('~/config', () => ({ config: { creditsServerUrl: 'https://credits.example' } }))

import {
  authorizeUsdCredit,
  cancelCreditOrder,
  cancelUsdIntents,
  creditOrderPill,
  devMintCredit,
  devMintUsd,
  fetchUserPurchases,
  getUsdBalance,
  getUserCredits,
  resumeCreditOrder,
  type CreditOrderStatus
} from '~/lib/credits'

const IDENTITY = {} as AuthIdentity

// Build a fetch-Response-like object with the ok/status/json/text surface these helpers read.
function ok(json: unknown) {
  return { ok: true, status: 200, json: async () => json, text: async () => JSON.stringify(json) }
}
function fail(status: number, body = 'boom') {
  return { ok: false, status, json: async () => ({}), text: async () => body }
}

beforeEach(() => {
  signedFetch.mockReset()
  vi.unstubAllGlobals()
})

describe('when fetching a user credits payload', () => {
  it('should GET the lowercased address path via signed-fetch and return the parsed body', async () => {
    const payload = { credits: [], totalCredits: 0, totals: { expiring: 0, nonExpiring: 0 } }
    signedFetch.mockResolvedValueOnce(ok(payload))

    const result = await getUserCredits('0xABCdef', IDENTITY)

    expect(result).toBe(payload)
    expect(signedFetch).toHaveBeenCalledTimes(1)
    const [url, opts] = signedFetch.mock.calls[0]
    expect(url).toBe('https://credits.example/users/0xabcdef/credits')
    expect(opts).toMatchObject({ method: 'GET', identity: IDENTITY, metadata: {} })
  })

  it('and the server responds non-ok it should throw with status and body text', async () => {
    signedFetch.mockResolvedValueOnce(fail(503, 'unavailable'))

    await expect(getUserCredits('0xabc', IDENTITY)).rejects.toThrow('getUserCredits 503: unavailable')
  })
})

describe('when reading the USD balance', () => {
  it('should return the usd block when present', async () => {
    const usd = { balanceCents: 1234, credits: 123 }
    signedFetch.mockResolvedValueOnce(
      ok({ credits: [], totalCredits: 0, totals: { expiring: 0, nonExpiring: 0 }, usd })
    )

    await expect(getUsdBalance('0xabc', IDENTITY)).resolves.toEqual(usd)
  })

  it('and the usd block is absent it should default to a zero balance', async () => {
    signedFetch.mockResolvedValueOnce(ok({ credits: [], totalCredits: 0, totals: { expiring: 0, nonExpiring: 0 } }))

    await expect(getUsdBalance('0xabc', IDENTITY)).resolves.toEqual({ balanceCents: 0, credits: 0 })
  })

  it('and getUserCredits fails it should propagate the error', async () => {
    signedFetch.mockResolvedValueOnce(fail(500))

    await expect(getUsdBalance('0xabc', IDENTITY)).rejects.toThrow('getUserCredits 500: boom')
  })
})

describe('when authorizing a USD credit for one purchase', () => {
  it('should POST usdPriceCents and tradeId and return the authorize result', async () => {
    const authorizeResult = {
      credit: { id: 'c1', amount: '1', availableAmount: '1', expiresAt: 1, signature: '0x', contract: '0xc' },
      maxCreditedValue: '1',
      usdCents: 250,
      oracleRate: '2'
    }
    signedFetch.mockResolvedValueOnce(ok(authorizeResult))

    const result = await authorizeUsdCredit(IDENTITY, 250, 'trade-1')

    expect(result).toBe(authorizeResult)
    const [url, opts] = signedFetch.mock.calls[0]
    expect(url).toBe('https://credits.example/credits/authorize')
    expect(opts.method).toBe('POST')
    expect(opts.headers).toEqual({ 'Content-Type': 'application/json' })
    expect(JSON.parse(opts.body)).toEqual({ usdPriceCents: 250, tradeId: 'trade-1' })
  })

  it('should omit tradeId from the body when not provided', async () => {
    signedFetch.mockResolvedValueOnce(ok({}))

    await authorizeUsdCredit(IDENTITY, 100)

    const body = JSON.parse(signedFetch.mock.calls[0][1].body)
    expect(body).toEqual({ usdPriceCents: 100 })
    expect('tradeId' in body).toBe(false)
  })

  // A mint has no trade, so the item is the only thing that records what the buyer got.
  it('should send the item identity alongside the price for a purchase with no trade', async () => {
    signedFetch.mockResolvedValueOnce(ok({}))

    await authorizeUsdCredit(IDENTITY, 30, undefined, { contractAddress: '0xC0', itemId: '12' })

    const body = JSON.parse(signedFetch.mock.calls[0][1].body)
    expect(body).toEqual({ usdPriceCents: 30, contractAddress: '0xC0', itemId: '12' })
    expect('tradeId' in body).toBe(false)
  })

  it('should send both the trade and the item when the purchase has both', async () => {
    signedFetch.mockResolvedValueOnce(ok({}))

    await authorizeUsdCredit(IDENTITY, 30, 'trade-1', { contractAddress: '0xC0', itemId: '12' })

    expect(JSON.parse(signedFetch.mock.calls[0][1].body)).toEqual({
      usdPriceCents: 30,
      tradeId: 'trade-1',
      contractAddress: '0xC0',
      itemId: '12'
    })
  })

  // The server rejects half an identity, so the client must never send one.
  it('should omit the item entirely when it is not provided', async () => {
    signedFetch.mockResolvedValueOnce(ok({}))

    await authorizeUsdCredit(IDENTITY, 100, 'trade-1')

    const body = JSON.parse(signedFetch.mock.calls[0][1].body)
    expect('contractAddress' in body).toBe(false)
    expect('itemId' in body).toBe(false)
  })

  it('and the server rejects it should throw with status and body', async () => {
    signedFetch.mockResolvedValueOnce(fail(402, 'insufficient'))

    await expect(authorizeUsdCredit(IDENTITY, 999)).rejects.toThrow('authorizeUsdCredit 402: insufficient')
  })
})

describe('when fetching the buyer purchase history', () => {
  it('should GET the confirmed-only path by default and unwrap purchases', async () => {
    const purchases = [
      { id: 'p1', tradeId: null, usdCents: 100, credits: 10, status: 'SETTLED', createdAt: 1, manaSettledWei: null }
    ]
    signedFetch.mockResolvedValueOnce(ok({ purchases }))

    const result = await fetchUserPurchases('0xABC', IDENTITY)

    // The record is returned with the absent fields normalised to null — `txHash` (no settlement hash on
    // the payload), the item identity and the submission hash, all of which an older server omits entirely.
    // One absent-value for every consumer to check instead of both null and undefined.
    expect(result.items).toEqual([
      { ...purchases[0], txHash: null, contractAddress: null, itemId: null, submittedTxHash: null }
    ])
    expect(signedFetch.mock.calls[0][0]).toBe('https://credits.example/users/0xabc/purchases')
  })

  it('should pass the item identity through when the server records it', async () => {
    const purchases = [
      {
        id: 'p1',
        tradeId: null,
        contractAddress: '0xC0',
        itemId: '12',
        usdCents: 30,
        credits: 3,
        status: 'SETTLED',
        createdAt: 1,
        manaSettledWei: null
      }
    ]
    signedFetch.mockResolvedValueOnce(ok({ purchases }))

    const result = await fetchUserPurchases('0xABC', IDENTITY)

    expect(result.items[0]).toMatchObject({ tradeId: null, contractAddress: '0xC0', itemId: '12' })
  })

  it('should normalise the settlement hash from either txHash or transactionHash', async () => {
    signedFetch.mockResolvedValueOnce(
      ok({
        purchases: [
          { id: 'p1', tradeId: 't1', usdCents: 100, credits: 10, status: 'SETTLED', createdAt: 1, txHash: '0xaaa' },
          {
            id: 'p2',
            tradeId: 't2',
            usdCents: 100,
            credits: 10,
            status: 'SETTLED',
            createdAt: 2,
            transactionHash: '0xbbb'
          },
          { id: 'p3', tradeId: 't3', usdCents: 100, credits: 10, status: 'PENDING', createdAt: 3 }
        ]
      })
    )

    const result = await fetchUserPurchases('0xabc', IDENTITY)

    expect(result.items.map(i => i.txHash)).toEqual(['0xaaa', '0xbbb', null])
  })

  it('should request status=all when opts.all is set', async () => {
    signedFetch.mockResolvedValueOnce(ok({ purchases: [] }))

    await fetchUserPurchases('0xabc', IDENTITY, { all: true })

    expect(signedFetch.mock.calls[0][0]).toBe('https://credits.example/users/0xabc/purchases?status=all')
  })

  it('should forward limit/offset and return the server total', async () => {
    const purchases = [
      { id: 'p1', tradeId: null, usdCents: 100, credits: 10, status: 'SETTLED', createdAt: 1, manaSettledWei: null }
    ]
    signedFetch.mockResolvedValueOnce(ok({ purchases, total: 42 }))

    const result = await fetchUserPurchases('0xabc', IDENTITY, { all: true, first: 24, skip: 24 })

    expect(result.total).toBe(42)
    const url = new URL(signedFetch.mock.calls[0][0] as string)
    expect(url.searchParams.get('status')).toBe('all')
    expect(url.searchParams.get('limit')).toBe('24')
    expect(url.searchParams.get('offset')).toBe('24')
  })

  it('and the server omits total it should assume another page when the page is full', async () => {
    const page = Array.from({ length: 24 }, (_, i) => ({ id: `p${i}` }))
    signedFetch.mockResolvedValueOnce(ok({ purchases: page })) // old server, no total

    const result = await fetchUserPurchases('0xabc', IDENTITY, { first: 24, skip: 0 })

    expect(result.total).toBeGreaterThan(24) // nudged so paging continues to the next page
  })

  it('and the payload omits purchases it should default to empty with zero total', async () => {
    signedFetch.mockResolvedValueOnce(ok({}))

    await expect(fetchUserPurchases('0xabc', IDENTITY)).resolves.toEqual({ items: [], total: 0 })
  })

  it('and the server responds non-ok it should throw', async () => {
    signedFetch.mockResolvedValueOnce(fail(401, 'nope'))

    await expect(fetchUserPurchases('0xabc', IDENTITY)).rejects.toThrow('fetchUserPurchases 401: nope')
  })
})

describe('when cancelling reserved USD intents', () => {
  it('should short-circuit to zero without calling the server for an empty list', async () => {
    const released = await cancelUsdIntents(IDENTITY, [])

    expect(released).toBe(0)
    expect(signedFetch).not.toHaveBeenCalled()
  })

  it('should POST the salts and return the released count', async () => {
    signedFetch.mockResolvedValueOnce(ok({ released: 2 }))

    const released = await cancelUsdIntents(IDENTITY, ['s1', 's2'])

    expect(released).toBe(2)
    const [url, opts] = signedFetch.mock.calls[0]
    expect(url).toBe('https://credits.example/credits/authorize/cancel')
    expect(opts.method).toBe('POST')
    expect(JSON.parse(opts.body)).toEqual({ salts: ['s1', 's2'] })
  })

  it('and the payload omits released it should default to zero', async () => {
    signedFetch.mockResolvedValueOnce(ok({}))

    await expect(cancelUsdIntents(IDENTITY, ['s1'])).resolves.toBe(0)
  })

  it('and the server responds non-ok it should throw', async () => {
    signedFetch.mockResolvedValueOnce(fail(500, 'bad'))

    await expect(cancelUsdIntents(IDENTITY, ['s1'])).rejects.toThrow('cancelUsdIntents 500: bad')
  })
})

describe('when dev-minting USD (plain fetch)', () => {
  it('should POST the lowercased address and default 1000 cents', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(ok({ id: 'm', usdCents: 1000, balanceCents: 1000, credits: 100 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await devMintUsd('0xABCdef')

    expect(result).toMatchObject({ usdCents: 1000 })
    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toBe('https://credits.example/dev/mint-usd')
    expect(opts.method).toBe('POST')
    expect(JSON.parse(opts.body)).toEqual({ address: '0xabcdef', usdCents: 1000 })
  })

  it('should pass an explicit cents amount through', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(ok({ id: 'm', usdCents: 500, balanceCents: 500, credits: 50 }))
    vi.stubGlobal('fetch', fetchMock)

    await devMintUsd('0xabc', 500)

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ address: '0xabc', usdCents: 500 })
  })

  it('and the server responds non-ok it should throw', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(fail(403, 'dev mint off')))

    await expect(devMintUsd('0xabc')).rejects.toThrow('devMintUsd 403: dev mint off')
  })
})

describe('when dev-minting a spendable credit (plain fetch)', () => {
  it('should POST the lowercased address, default amount 100 and a fixed reason', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(ok({ signature: '0x', expiresAt: 1, seasonId: null, creditId: 'c' }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await devMintCredit('0xABC')

    expect(result).toMatchObject({ creditId: 'c' })
    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toBe('https://credits.example/dev/mint-credit')
    expect(JSON.parse(opts.body)).toEqual({ address: '0xabc', amount: 100, reason: 'shop dev mint' })
  })

  it('should pass an explicit amount through', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(ok({ signature: '0x', expiresAt: 1, seasonId: 2, creditId: 'c' }))
    vi.stubGlobal('fetch', fetchMock)

    await devMintCredit('0xabc', 42)

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ amount: 42 })
  })

  it('and the server responds non-ok it should throw', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(fail(500, 'kaboom')))

    await expect(devMintCredit('0xabc')).rejects.toThrow('devMintCredit 500: kaboom')
  })
})

/**
 * The pill mapping is the one place the credits-server's status vocabulary is translated, so it is the one
 * place worth pinning. Exhaustive on purpose: `satisfies` plus a case per value means adding a status to
 * CreditOrderStatus without deciding how it reads in the feed fails to compile here.
 *
 * The bug this guards: CreditOrder.status was declared as PENDING/SETTLED/EXPIRED, copied from the
 * PurchaseRecord type a few lines above it. The server sends none of those, so every comparison silently
 * failed — dead orders were never filtered out of Activity and every row rendered as "Completed".
 */
describe('creditOrderPill', () => {
  const cases = {
    // Nobody has paid: the buyer can still finish it, and nothing is owed to them.
    initiated: 'UNFINISHED',
    processing: 'PENDING',
    crediting: 'PENDING',
    credited: 'SETTLED',
    failed: 'FAILED',
    abandoned: 'FAILED'
  } satisfies Record<CreditOrderStatus, ReturnType<typeof creditOrderPill>>

  it.each(Object.entries(cases))('should map %s to %s', (status, expected) => {
    expect(creditOrderPill(status as CreditOrderStatus)).toBe(expected)
  })

  // The regression the split exists for: an unpaid checkout must never wear the same pill as money on
  // its way, which is what read as "you are owed credits" for a day after the buyer walked away.
  it('should not present an unpaid checkout as money on its way', () => {
    expect(creditOrderPill('initiated')).not.toBe(creditOrderPill('processing'))
    expect(creditOrderPill('initiated')).not.toBe('PENDING')
  })

  it('should never report money as available for a status that is not credited', () => {
    const notYet: CreditOrderStatus[] = ['initiated', 'processing', 'crediting', 'failed', 'abandoned']
    for (const status of notYet) expect(creditOrderPill(status)).not.toBe('SETTLED')
  })
})

/**
 * RETIRING AND RESUMING A CHECKOUT.
 *
 * Both talk to the credits server about an order the buyer walked away from, and both are deliberately
 * forgiving: the server retires an abandoned order on its own, so a failed cancel must not surface as an
 * error the buyer has to act on, and a resume that cannot produce a checkout URL has to say so rather than
 * hand back something unusable.
 *
 * They also both consume the response body on the paths where they ignore it. An error response still
 * carries a stream, and abandoning it unread holds the connection until GC — the same reason fetchTrade
 * cancels its 404 body.
 */
describe('cancelCreditOrder', () => {
  it('should POST to the order cancel endpoint with the signed identity', async () => {
    const cancel = vi.fn()
    signedFetch.mockResolvedValue({ ok: true, status: 200, body: { cancel } })

    await cancelCreditOrder('order-1', IDENTITY)

    const [url, opts] = signedFetch.mock.calls[0]
    expect(String(url)).toContain('/credits/orders/order-1/cancel')
    expect(opts).toMatchObject({ method: 'POST', identity: IDENTITY, metadata: {} })
    // Nothing reads the body, so it must be released rather than left open.
    expect(cancel).toHaveBeenCalled()
  })

  it('should escape an order id that would otherwise break the path', async () => {
    signedFetch.mockResolvedValue({ ok: true, status: 200, body: { cancel: vi.fn() } })

    await cancelCreditOrder('a/b?c', IDENTITY)

    expect(String(signedFetch.mock.calls[0][0])).toContain('/credits/orders/a%2Fb%3Fc/cancel')
  })

  it('should swallow a failure, since the server retires the order anyway', async () => {
    signedFetch.mockRejectedValue(new Error('network down'))

    await expect(cancelCreditOrder('order-1', IDENTITY)).resolves.toBeUndefined()
  })
})

describe('resumeCreditOrder', () => {
  it('should return the checkout URL the server hands back', async () => {
    signedFetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ url: 'https://pay.test/s1' }) })

    await expect(resumeCreditOrder('order-1', IDENTITY)).resolves.toBe('https://pay.test/s1')
    expect(String(signedFetch.mock.calls[0][0])).toContain('/credits/orders/order-1/resume')
  })

  it('should return null when the response carries no URL, rather than an unusable value', async () => {
    signedFetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) })

    await expect(resumeCreditOrder('order-1', IDENTITY)).resolves.toBeNull()
  })

  it('should return null and release the body on a non-ok response', async () => {
    const cancel = vi.fn()
    signedFetch.mockResolvedValue({ ok: false, status: 409, body: { cancel }, json: async () => ({}) })

    await expect(resumeCreditOrder('order-1', IDENTITY)).resolves.toBeNull()
    expect(cancel).toHaveBeenCalled()
  })

  it('should return null when the request throws', async () => {
    signedFetch.mockRejectedValue(new Error('network down'))

    await expect(resumeCreditOrder('order-1', IDENTITY)).resolves.toBeNull()
  })
})
