import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AuthIdentity } from '@dcl/crypto'

// signedFetch is the default export of decentraland-crypto-fetch; capture every call so we can
// assert URL / method / body without hitting the network. vi.hoisted keeps the fn defined before
// the hoisted vi.mock factory runs.
const { signedFetch } = vi.hoisted(() => ({ signedFetch: vi.fn() }))
vi.mock('decentraland-crypto-fetch', () => ({ default: signedFetch }))

// Config is mutated per-test to drive the paymentsBaseUrl() branch (shopServerUrl preferred over
// creditsServerUrl). Default: no shop-server → falls back to the credits-server base.
const { config } = vi.hoisted(() => ({ config: { shopServerUrl: '', creditsServerUrl: 'https://credits.example' } }))
vi.mock('~/config', () => ({ config }))

// eslint-disable-next-line import/first
import { createPackCheckoutReal, pollCreditGrantReal } from '~/lib/payments-stripe'

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
  config.shopServerUrl = ''
  config.creditsServerUrl = 'https://credits.example'
})

describe('when starting a real pack checkout', () => {
  it('should POST packId via signed-fetch and return the Stripe client secret as a non-mock session', async () => {
    signedFetch.mockResolvedValueOnce(ok({ orderId: 'ord_1', clientSecret: 'cs_test_123' }))

    const session = await createPackCheckoutReal('pack_25', IDENTITY)

    expect(session).toEqual({ orderId: 'ord_1', clientSecret: 'cs_test_123', mock: false })
    expect(signedFetch).toHaveBeenCalledTimes(1)
    const [url, opts] = signedFetch.mock.calls[0]
    expect(url).toBe('https://credits.example/credits/checkout')
    expect(opts.method).toBe('POST')
    expect(opts.identity).toBe(IDENTITY)
    expect(opts.metadata).toEqual({})
    expect(opts.headers).toEqual({ 'Content-Type': 'application/json' })
    expect(JSON.parse(opts.body)).toEqual({ packId: 'pack_25' })
  })

  it('should prefer the shop-server base url when one is configured', async () => {
    config.shopServerUrl = 'https://shop.example'
    signedFetch.mockResolvedValueOnce(ok({ orderId: 'ord_2', clientSecret: 'cs_2' }))

    await createPackCheckoutReal('pack_10', IDENTITY)

    expect(signedFetch.mock.calls[0][0]).toBe('https://shop.example/credits/checkout')
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

  it('should poll the shop-server base url when one is configured', async () => {
    config.shopServerUrl = 'https://shop.example'
    signedFetch.mockResolvedValueOnce(ok({ status: 'credited', creditsGranted: 5, newBalance: 5 }))

    await pollCreditGrantReal('ord_9', IDENTITY, { intervalMs: 1 })

    expect(signedFetch.mock.calls[0][0]).toBe('https://shop.example/credits/orders/ord_9')
  })
})
