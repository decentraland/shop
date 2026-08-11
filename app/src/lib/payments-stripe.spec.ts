import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { AuthIdentity } from '@dcl/crypto'

// signedFetch is the default export of decentraland-crypto-fetch; capture every call so we can
// assert URL / method / body without hitting the network. vi.hoisted keeps the fn defined before
// the hoisted vi.mock factory runs.
const { signedFetch } = vi.hoisted(() => ({ signedFetch: vi.fn() }))
vi.mock('decentraland-crypto-fetch', () => ({ default: signedFetch }))

// The /credits/* endpoints live on the credits-server (G1); paymentsBaseUrl() always uses
// creditsServerUrl — shop-server is the treasury leg and is never on the buy path.
const { config } = vi.hoisted(() => ({ config: { creditsServerUrl: 'https://credits.example' } }))
vi.mock('~/config', () => ({ config }))

import { createPackCheckoutReal, pollCreditGrantReal } from '~/lib/payments-stripe'

const IDENTITY = {} as AuthIdentity

// Build a fetch-Response-like object with the ok/status/json/text surface these helpers read.
function ok(json: unknown) {
  return { ok: true, status: 200, json: async () => json, text: async () => JSON.stringify(json) }
}
function fail(status: number, body = 'boom') {
  return { ok: false, status, json: async () => ({}), text: async () => body }
}

// The checkout body carries the buyer's zone, which would otherwise be whatever TZ the runner happens to
// have — UTC in CI, local on a laptop. Pin it so the body assertions mean something.
const PINNED_TIMEZONE = 'America/Buenos_Aires'

beforeEach(() => {
  signedFetch.mockReset()
  config.creditsServerUrl = 'https://credits.example'
  vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({
    timeZone: PINNED_TIMEZONE
  } as Intl.ResolvedDateTimeFormatOptions)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('when starting a real pack checkout', () => {
  it('should POST packId via signed-fetch and return the Stripe hosted-Checkout url as a non-mock session', async () => {
    signedFetch.mockResolvedValueOnce(ok({ orderId: 'ord_1', url: 'https://checkout.stripe.com/c/pay/cs_test_123' }))

    const session = await createPackCheckoutReal('pack_25', IDENTITY)

    expect(session).toEqual({ orderId: 'ord_1', url: 'https://checkout.stripe.com/c/pay/cs_test_123', mock: false })
    expect(signedFetch).toHaveBeenCalledTimes(1)
    const [url, opts] = signedFetch.mock.calls[0]
    expect(url).toBe('https://credits.example/credits/checkout')
    expect(opts.method).toBe('POST')
    expect(opts.identity).toBe(IDENTITY)
    expect(opts.metadata).toEqual({})
    expect(opts.headers).toEqual({ 'Content-Type': 'application/json' })
    expect(JSON.parse(opts.body)).toEqual({ packId: 'pack_25', timezone: PINNED_TIMEZONE })
  })

  it('should send the buyer timezone so abandonment can be read by region', async () => {
    signedFetch.mockResolvedValueOnce(ok({ orderId: 'ord_tz', url: 'https://checkout.stripe.com/c/pay/cs_tz' }))

    await createPackCheckoutReal('pack_25', IDENTITY)

    expect(JSON.parse(signedFetch.mock.calls[0][1].body).timezone).toBe(PINNED_TIMEZONE)
  })

  // A runtime with no zone must still be able to buy: the field is a reporting hint, so it is omitted
  // rather than sent as null, and the checkout goes through untouched.
  it('should omit the timezone entirely when the runtime cannot report one', async () => {
    vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockImplementation(() => {
      throw new Error('no Intl data in this build')
    })
    signedFetch.mockResolvedValueOnce(ok({ orderId: 'ord_no_tz', url: 'https://checkout.stripe.com/c/pay/cs_n' }))

    const session = await createPackCheckoutReal('pack_5', IDENTITY)

    expect(session.orderId).toBe('ord_no_tz')
    expect(JSON.parse(signedFetch.mock.calls[0][1].body)).toEqual({ packId: 'pack_5' })
  })

  // An engine built without full ICU data can return an empty zone instead of throwing. It must be dropped
  // like a missing one, not sent as `"timezone":""` — which is what makes the `|| undefined` guard in
  // buyerTimezone() load-bearing now that the body no longer branches on the value.
  it('should omit an empty timezone rather than sending a blank one', async () => {
    vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({
      timeZone: ''
    } as Intl.ResolvedDateTimeFormatOptions)
    signedFetch.mockResolvedValueOnce(ok({ orderId: 'ord_blank', url: 'https://checkout.stripe.com/c/pay/cs_b' }))

    await createPackCheckoutReal('pack_5', IDENTITY)

    expect(JSON.parse(signedFetch.mock.calls[0][1].body)).toEqual({ packId: 'pack_5' })
  })

  it('should hit the credits-server base url for the checkout (never shop-server) (G1)', async () => {
    signedFetch.mockResolvedValueOnce(ok({ orderId: 'ord_2', url: 'https://checkout.stripe.com/c/pay/cs_2' }))

    await createPackCheckoutReal('pack_10', IDENTITY)

    expect(signedFetch.mock.calls[0][0]).toBe('https://credits.example/credits/checkout')
  })

  it('and the server responds non-ok it should throw with the status and body text', async () => {
    signedFetch.mockResolvedValueOnce(fail(402, 'card declined'))

    await expect(createPackCheckoutReal('pack_5', IDENTITY)).rejects.toThrow('checkout 402: card declined')
  })
})

describe('when polling a real credit grant', () => {
  it('should return immediately once the order is credited', async () => {
    signedFetch.mockResolvedValueOnce(ok({ status: 'credited', creditsGranted: 250, newBalance: 250 }))

    const result = await pollCreditGrantReal('ord_1', IDENTITY, { intervalMs: 1 })

    expect(result).toEqual({ status: 'credited', creditsGranted: 250, newBalance: 250 })
    expect(signedFetch).toHaveBeenCalledTimes(1)
    const [url, opts] = signedFetch.mock.calls[0]
    expect(url).toBe('https://credits.example/credits/orders/ord_1')
    expect(opts.method).toBe('GET')
    expect(opts.identity).toBe(IDENTITY)
    expect(opts.metadata).toEqual({})
  })

  it('should keep polling while the order is processing and resolve when it flips off processing', async () => {
    signedFetch
      .mockResolvedValueOnce(ok({ status: 'processing' }))
      .mockResolvedValueOnce(ok({ status: 'processing' }))
      .mockResolvedValueOnce(ok({ status: 'credited', creditsGranted: 100, newBalance: 100 }))

    const result = await pollCreditGrantReal('ord_2', IDENTITY, { intervalMs: 1 })

    expect(result.status).toBe('credited')
    expect(result.creditsGranted).toBe(100)
    expect(signedFetch).toHaveBeenCalledTimes(3)
  })

  /**
   * 'crediting' is the grant IN FLIGHT — the money is in, the ledger write has started. It reached this
   * client as an unknown status: the poll returned it on the first read and every branch on the page fell
   * through to "we couldn't add your credits", shown to somebody who had just been charged.
   */
  it('and the grant is in flight (crediting) it should keep polling rather than return it as a final answer', async () => {
    signedFetch
      .mockResolvedValueOnce(ok({ status: 'crediting' }))
      .mockResolvedValueOnce(ok({ status: 'crediting' }))
      .mockResolvedValueOnce(ok({ status: 'credited', creditsGranted: 100, newBalance: 100 }))

    const result = await pollCreditGrantReal('ord_crediting', IDENTITY, { intervalMs: 1 })

    expect(result.status).toBe('credited')
    expect(signedFetch).toHaveBeenCalledTimes(3)
  })

  it('and the deadline passes while crediting it should return pending — the money is in and the grant can still land', async () => {
    signedFetch.mockResolvedValueOnce(ok({ status: 'crediting' }))

    const result = await pollCreditGrantReal('ord_crediting_slow', IDENTITY, { intervalMs: 1, timeoutMs: -1 })

    expect(result).toEqual({ status: 'pending' })
  })

  /**
   * 'initiated' is the opposite of the two above: NOBODY HAS PAID. It still has to be polled through,
   * because the Stripe return can beat the webhook that moves the order off it — bailing on the first read
   * would tell a buyer who did pay that they had not.
   */
  it('and the order is still initiated it should keep polling, because the return can beat the webhook', async () => {
    signedFetch
      .mockResolvedValueOnce(ok({ status: 'initiated' }))
      .mockResolvedValueOnce(ok({ status: 'processing' }))
      .mockResolvedValueOnce(ok({ status: 'credited', creditsGranted: 40, newBalance: 40 }))

    const result = await pollCreditGrantReal('ord_initiated_race', IDENTITY, { intervalMs: 1 })

    expect(result.status).toBe('credited')
    expect(signedFetch).toHaveBeenCalledTimes(3)
  })

  it('and the deadline passes while still initiated it should NOT claim credits are on the way for an unpaid order', async () => {
    signedFetch.mockResolvedValueOnce(ok({ status: 'initiated' }))

    const result = await pollCreditGrantReal('ord_unpaid', IDENTITY, { intervalMs: 1, timeoutMs: -1 })

    // 'pending' is the "your credits are on the way" answer. No payment was ever reported against this
    // order, so promising credits here is the exact lie the server split 'initiated' out to prevent.
    expect(result.status).not.toBe('pending')
    expect(result.status).toBe('initiated')
  })

  it('should return a failed status when the order reports failed', async () => {
    signedFetch.mockResolvedValueOnce(ok({ status: 'failed', error: 'charge failed' }))

    const result = await pollCreditGrantReal('ord_3', IDENTITY, { intervalMs: 1 })

    expect(result).toEqual({ status: 'failed', error: 'charge failed' })
  })

  it('and the deadline has passed while still processing it should return pending (not failed) — the webhook can still grant later', async () => {
    // timeoutMs -1 → the deadline is already in the past, so the first 'processing' read gives up.
    signedFetch.mockResolvedValueOnce(ok({ status: 'processing' }))

    const result = await pollCreditGrantReal('ord_4', IDENTITY, { intervalMs: 1, timeoutMs: -1 })

    // Not a hard failure: the payment may still settle via the verified webhook after we stop polling (U7).
    expect(result).toEqual({ status: 'pending' })
    expect(signedFetch).toHaveBeenCalledTimes(1)
  })

  it('should treat a transient 404 on the Stripe return as still-processing and resolve once visible', async () => {
    // On the return callback the order row can be briefly invisible (replica lag / identity not yet
    // restored) → 404. That must NOT throw a hard error on a paid order; keep polling.
    signedFetch
      .mockResolvedValueOnce(fail(404, 'Order not found'))
      .mockResolvedValueOnce(fail(404, 'Order not found'))
      .mockResolvedValueOnce(ok({ status: 'credited', creditsGranted: 250, newBalance: 250 }))

    const result = await pollCreditGrantReal('ord_404', IDENTITY, { intervalMs: 1 })

    expect(result).toEqual({ status: 'credited', creditsGranted: 250, newBalance: 250 })
    expect(signedFetch).toHaveBeenCalledTimes(3)
  })

  it('should return pending (not throw) when a 404 persists past the deadline', async () => {
    signedFetch.mockResolvedValueOnce(fail(404, 'Order not found'))

    const result = await pollCreditGrantReal('ord_404b', IDENTITY, { intervalMs: 1, timeoutMs: -1 })

    expect(result).toEqual({ status: 'pending' })
  })

  it('should abort before any request when the signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()

    await expect(pollCreditGrantReal('ord_5', IDENTITY, { signal: controller.signal })).rejects.toThrow('Aborted')
    expect(signedFetch).not.toHaveBeenCalled()
  })

  it('should abort mid-wait when the signal fires between polls', async () => {
    signedFetch.mockResolvedValue(ok({ status: 'processing' }))
    const controller = new AbortController()

    const pending = pollCreditGrantReal('ord_6', IDENTITY, { intervalMs: 50, signal: controller.signal })
    // Let the first poll resolve, then abort during the delay before the next poll.
    await Promise.resolve()
    controller.abort()

    await expect(pending).rejects.toThrow('Aborted')
  })

  it('should forward the abort signal to the order-status request', async () => {
    const controller = new AbortController()
    signedFetch.mockResolvedValueOnce(ok({ status: 'credited', creditsGranted: 10, newBalance: 10 }))

    await pollCreditGrantReal('ord_7', IDENTITY, { signal: controller.signal })

    expect(signedFetch.mock.calls[0][1].signal).toBe(controller.signal)
  })

  it('and the order-status request responds non-ok it should throw with the status', async () => {
    signedFetch.mockResolvedValueOnce(fail(500))

    await expect(pollCreditGrantReal('ord_8', IDENTITY, { intervalMs: 1 })).rejects.toThrow('order status 500')
  })

  it('should poll the credits-server base url (never shop-server) (G1)', async () => {
    signedFetch.mockResolvedValueOnce(ok({ status: 'credited', creditsGranted: 5, newBalance: 5 }))

    await pollCreditGrantReal('ord_9', IDENTITY, { intervalMs: 1 })

    expect(signedFetch.mock.calls[0][0]).toBe('https://credits.example/credits/orders/ord_9')
  })
})
