import { describe, it, expect, vi, beforeEach } from 'vitest'

// Keep monitoring isolated: no real config/wallet needed for the pure helpers.
vi.mock('~/config', () => ({ config: { sentryDsn: '', sentryEnvironment: 'test', sentryRelease: 'shop@test' } }))
vi.mock('~/store/wallet', () => ({ useWallet: { getState: () => ({ session: null }) } }))

import * as Sentry from '@sentry/react'
import {
  captureError,
  isLocalhost,
  redact,
  rpcFactsFrom,
  scrubEvent,
  sentryForwarder,
  setErrorForwarder,
  tagsFrom,
  toReportable
} from '~/lib/monitoring'

describe('isLocalhost', () => {
  it('is true for local hosts (so localhost never reports to Sentry)', () => {
    for (const h of ['localhost', '127.0.0.1', '0.0.0.0', '[::1]', 'shop.local']) expect(isLocalhost(h)).toBe(true)
  })
  it('is false for deployed hosts (zone/stg/prod report)', () => {
    for (const h of ['decentraland.zone', 'market.decentraland.zone', 'decentraland.org']) {
      expect(isLocalhost(h)).toBe(false)
    }
  })
})

describe('redact', () => {
  it('redacts signatures, 32-byte hex, and secret-shaped tokens', () => {
    const sig = '0x' + 'ab'.repeat(65) // 130 hex chars
    const key = '0x' + 'cd'.repeat(32) // 64 hex chars
    expect(redact(`sig=${sig}`)).toContain('<signature>')
    expect(redact(`sig=${sig}`)).not.toContain(sig)
    expect(redact(`key=${key}`)).toContain('<hex32>')
    expect(redact('charge sk_test_abc123')).toContain('<secret>')
    expect(redact('client_secret_xyz')).toContain('<secret>')
  })

  it('leaves a plain wallet address (40 hex) intact — it is public', () => {
    const addr = '0x' + '12'.repeat(20) // 40 hex chars
    expect(redact(`addr=${addr}`)).toContain(addr)
  })
})

describe('scrubEvent', () => {
  it('redacts free text and drops sensitive tag/extra keys', () => {
    const sig = '0x' + 'ab'.repeat(65)
    const event = {
      message: `boom ${sig}`,
      exception: { values: [{ value: `revert ${sig}` }] },
      tags: { flow: 'buy', signature: sig, authorization: 'Bearer x' },
      extra: { step: 'submit', identity: 'secret-identity' }
    } as never

    const out = scrubEvent(event) as unknown as {
      message: string
      exception: { values: Array<{ value: string }> }
      tags: Record<string, unknown>
      extra: Record<string, unknown>
    }

    expect(out.message).toContain('<signature>')
    expect(out.exception.values[0].value).toContain('<signature>')
    expect(out.tags.signature).toBeUndefined()
    expect(out.tags.authorization).toBeUndefined()
    expect(out.tags.flow).toBe('buy') // safe context survives
    expect(out.extra.identity).toBeUndefined()
    expect(out.extra.step).toBe('submit')
  })
})

/**
 * `extra` is not indexed by Sentry — it cannot be searched, filtered or charted, only read once an event
 * is open. Promoting `flow`/`step` to tags is what makes "how often does step X fail" answerable at all.
 */
describe('tagsFrom', () => {
  it('promotes flow and step so they can be searched and charted', () => {
    expect(tagsFrom({ flow: 'buy', step: 'mana_price' })).toEqual({ flow: 'buy', step: 'mana_price' })
  })

  it('promotes nothing else, whatever the context carries', () => {
    // High-cardinality values (ids, addresses, amounts) would exhaust Sentry's tag budget and make the
    // facet useless. They stay in `extra`, which is still attached.
    const tags = tagsFrom({ flow: 'buy', creditId: '0xabc', address: '0xdead', usdCents: 1350 })
    expect(tags).toEqual({ flow: 'buy' })
  })

  it('drops a non-string or empty value rather than coercing it to a label', () => {
    expect(tagsFrom({ flow: 42, step: {} })).toEqual({})
    expect(tagsFrom({ flow: '', step: 'submit' })).toEqual({ step: 'submit' })
  })

  it('returns no tags for an empty context', () => {
    expect(tagsFrom({})).toEqual({})
  })
})

/**
 * The integration point. `tagsFrom` being correct is worth nothing if the sink does not pass its result
 * to Sentry — and with the call inlined in `initSentry`, deleting `tags` there passed every other test
 * in this file. This is the one that fails when the promotion is removed.
 */
describe('sentryForwarder', () => {
  it('sends flow and step as TAGS, and the whole context as extra', () => {
    const captureException = vi.spyOn(Sentry, 'captureException').mockImplementation(() => '')
    const err = new Error('oracle down')

    sentryForwarder(err, { flow: 'buy', step: 'mana_price', creditId: '0xabc' })

    expect(captureException).toHaveBeenCalledWith(err, {
      tags: { flow: 'buy', step: 'mana_price' },
      extra: { flow: 'buy', step: 'mana_price', creditId: '0xabc' }
    })
    captureException.mockRestore()
  })
})

/**
 * Wallet/JSON-RPC failures are plain objects, and Sentry titles those with the minified frame that
 * captured them — which is how four production issues came to be called `ds`, hiding eleven purchase
 * failures.
 */
describe('toReportable', () => {
  it('titles a wallet RPC object with its own message and code', () => {
    const rpc = { code: -32603, message: 'Failed to fetch', data: { originalError: {} } }

    const out = toReportable(rpc) as Error & { cause?: unknown }

    expect(out).toBeInstanceOf(Error)
    expect(out.message).toBe('Failed to fetch (code -32603)')
    expect(out.cause).toBe(rpc) // nothing is lost
  })

  it('keeps the ORIGINAL stack so failures group by where they happened', () => {
    // A fresh Error's stack points at monitoring.ts, which would collapse every wallet failure in the
    // app into one issue — an unreadable grouping in exchange for a readable title.
    const stack = 'TypeError: Failed to fetch\n    at makeEthereumJSONRPCRequest (requestRelay.js:2:220679)'
    const out = toReportable({ code: -32603, message: 'Failed to fetch', stack }) as Error

    expect(out.stack).toBe(stack)
  })

  it('passes a real Error straight through', () => {
    const err = new Error('boom')
    expect(toReportable(err)).toBe(err)
  })

  it('leaves anything without a usable message alone', () => {
    // Nothing to title it with — wrapping would only add a frame and lose the shape.
    const noMessage = { code: 4001 }
    expect(toReportable(noMessage)).toBe(noMessage)
    expect(toReportable({ message: '' })).toEqual({ message: '' })
    expect(toReportable('a string')).toBe('a string')
    expect(toReportable(null)).toBe(null)
    expect(toReportable(undefined)).toBe(undefined)
  })

  it('omits the code suffix when the object has no code', () => {
    expect((toReportable({ message: 'plain failure' }) as Error).message).toBe('plain failure')
  })
})

/**
 * The title fix only helps while the provider's message survives, and it does not always: Sentry's
 * server-side scrubbing returned `[Filtered]` for the message AND stack of the cart checkout a wallet
 * rejected with a 401. These fields are ours, so they arrive regardless.
 */
describe('rpcFactsFrom', () => {
  it('lifts the rpc code and the http status out of a wallet error', () => {
    // The exact shape of the cart checkout that produced an unreadable event in production.
    expect(rpcFactsFrom({ code: -32006, data: { cause: null, httpStatus: 401 }, message: 'x' })).toEqual({
      rpc_code: -32006,
      http_status: 401
    })
  })

  it('takes whichever of the two the error actually carries', () => {
    expect(rpcFactsFrom({ code: -32603, message: 'Failed to fetch' })).toEqual({ rpc_code: -32603 })
    expect(rpcFactsFrom({ data: { httpStatus: 429 } })).toEqual({ http_status: 429 })
  })

  it('reports nothing for a plain Error or a non-object', () => {
    expect(rpcFactsFrom(new Error('boom'))).toEqual({})
    expect(rpcFactsFrom('a string')).toEqual({})
    expect(rpcFactsFrom(null)).toEqual({})
    expect(rpcFactsFrom({ data: 'not-an-object' })).toEqual({})
  })
})

describe('captureError', () => {
  beforeEach(() => setErrorForwarder(null))

  it('attaches the rpc facts so the event says something even if the message is scrubbed', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const forwarder = vi.fn()
    setErrorForwarder(forwarder)

    captureError({ code: -32006, data: { httpStatus: 401 }, message: 'Unauthorized' }, { flow: 'cart_checkout' })

    const [, ctx] = forwarder.mock.calls[0] as [unknown, Record<string, unknown>]
    expect(ctx).toEqual({ flow: 'cart_checkout', rpc_code: -32006, http_status: 401 })
    // And they are searchable, not just readable.
    expect(tagsFrom(ctx)).toEqual({ flow: 'cart_checkout', rpc_code: '-32006', http_status: '401' })
    spy.mockRestore()
    setErrorForwarder(null)
  })

  it('never lets the thrown value overwrite what the caller said', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const forwarder = vi.fn()
    setErrorForwarder(forwarder)

    captureError({ code: -32006 }, { flow: 'buy', rpc_code: 'from-the-caller' })

    const [, ctx] = forwarder.mock.calls[0] as [unknown, Record<string, unknown>]
    expect(ctx.rpc_code).toBe('from-the-caller')
    spy.mockRestore()
    setErrorForwarder(null)
  })

  it('forwards a nameable error while the console still sees the value as thrown', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const forwarder = vi.fn()
    setErrorForwarder(forwarder)
    const rpc = { code: -32006, message: 'Unauthorized' }

    captureError(rpc, { flow: 'cart_checkout', step: 'submit' })

    expect(spy).toHaveBeenCalledWith(expect.any(String), rpc, expect.anything())
    const [reported] = forwarder.mock.calls[0] as [Error]
    expect(reported).toBeInstanceOf(Error)
    expect(reported.message).toBe('Unauthorized (code -32006)')
    spy.mockRestore()
    setErrorForwarder(null)
  })

  it('logs to the console and forwards to the wired sink', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const forwarder = vi.fn()
    setErrorForwarder(forwarder)
    const err = new Error('x')

    captureError(err, { flow: 'buy' })

    expect(spy).toHaveBeenCalled()
    expect(forwarder).toHaveBeenCalledWith(err, { flow: 'buy' })
    spy.mockRestore()
    setErrorForwarder(null)
  })

  it('never throws even if the forwarder throws', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    setErrorForwarder(() => {
      throw new Error('sink down')
    })
    expect(() => captureError(new Error('x'))).not.toThrow()
    spy.mockRestore()
    setErrorForwarder(null)
  })
})
