import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AuthIdentity } from '@dcl/crypto'

// signedFetch is the default export of decentraland-crypto-fetch; capture every call so we can assert
// URL / method / body without hitting the network.
const { signedFetch } = vi.hoisted(() => ({ signedFetch: vi.fn() }))
vi.mock('decentraland-crypto-fetch', () => ({ default: signedFetch }))

// shopServerUrl is mutated per-test: empty is the shipped state (no host wired into the env JSONs yet).
const { config } = vi.hoisted(() => ({ config: { shopServerUrl: '' } }))
vi.mock('~/config', () => ({ config }))

import { createNotifyRequest, getNotifyRequest, isNotifyAvailable } from '~/lib/notify'

const IDENTITY = {} as AuthIdentity
const REQUEST = { contractAddress: '0xc', itemId: '5', chainId: 80002, email: 'jane.doe@example.com' }

function ok(json: unknown) {
  return { ok: true, status: 200, json: async () => json, text: async () => JSON.stringify(json) }
}
// What a static SPA host answers for a path it doesn't implement: 200, but HTML rather than JSON.
function indexHtml() {
  return {
    ok: true,
    status: 200,
    json: async () => {
      throw new SyntaxError('Unexpected token < in JSON at position 0')
    },
    text: async () => '<!doctype html><html></html>'
  }
}

beforeEach(() => {
  signedFetch.mockReset()
  config.shopServerUrl = ''
})

describe('when no shop-server host is configured', () => {
  it('should report the feature as unavailable', () => {
    expect(isNotifyAvailable()).toBe(false)
  })

  it('should report "not subscribed" without any request — the app origin is not the notify API', async () => {
    await expect(getNotifyRequest('0xc', '5', IDENTITY)).resolves.toEqual({ subscribed: false })
    expect(signedFetch).not.toHaveBeenCalled()
  })

  it('should refuse to subscribe rather than report a success it cannot store', async () => {
    await expect(createNotifyRequest(REQUEST, IDENTITY)).rejects.toThrow(/no shop-server host/i)
    expect(signedFetch).not.toHaveBeenCalled()
  })
})

describe('when a shop-server host is configured', () => {
  beforeEach(() => {
    config.shopServerUrl = 'https://shop.example'
  })

  it('should report the feature as available', () => {
    expect(isNotifyAvailable()).toBe(true)
  })

  it('should GET the item status via signed-fetch and return the parsed body', async () => {
    signedFetch.mockResolvedValueOnce(ok({ subscribed: true, email: 'jane.doe@example.com' }))

    const status = await getNotifyRequest('0xc', '5', IDENTITY)

    expect(status).toEqual({ subscribed: true, email: 'jane.doe@example.com' })
    const [url, init] = signedFetch.mock.calls[0]
    expect(url).toBe('https://shop.example/notify-requests?contractAddress=0xc&itemId=5')
    expect(init.method).toBe('GET')
  })

  it('should POST the subscription via signed-fetch', async () => {
    signedFetch.mockResolvedValueOnce(ok({ ok: true }))

    await createNotifyRequest(REQUEST, IDENTITY)

    const [url, init] = signedFetch.mock.calls[0]
    expect(url).toBe('https://shop.example/notify-requests')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual(REQUEST)
  })

  it('should throw on a non-JSON 200 instead of treating an HTML shell as a stored subscription', async () => {
    signedFetch.mockResolvedValueOnce(indexHtml())

    await expect(createNotifyRequest(REQUEST, IDENTITY)).rejects.toThrow(/not JSON/i)
  })

  // A create endpoint answering 201/204 with no body is ordinary; only a non-empty non-JSON body means
  // "this host isn't the notify API". Rejecting an empty success would show the buyer a false failure.
  it.each([
    ['204 with no body', { ok: true, status: 204, text: async () => '' }],
    ['201 with whitespace', { ok: true, status: 201, text: async () => '\n' }]
  ])('should accept a %s as a stored subscription', async (_label, res) => {
    signedFetch.mockResolvedValueOnce(res)

    await expect(createNotifyRequest(REQUEST, IDENTITY)).resolves.toBeUndefined()
  })

  it('should throw when the status lookup answers with a non-JSON 200', async () => {
    signedFetch.mockResolvedValueOnce(indexHtml())

    await expect(getNotifyRequest('0xc', '5', IDENTITY)).rejects.toThrow(/not JSON/i)
  })

  it('should surface a failed subscribe', async () => {
    signedFetch.mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'boom' })

    await expect(createNotifyRequest(REQUEST, IDENTITY)).rejects.toThrow(/500/)
  })
})
