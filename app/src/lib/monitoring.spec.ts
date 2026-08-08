import { describe, it, expect, vi, beforeEach } from 'vitest'

// Keep monitoring isolated: no real config/wallet needed for the pure helpers.
vi.mock('~/config', () => ({ config: { sentryDsn: '', sentryEnvironment: 'test', sentryRelease: 'shop@test' } }))
vi.mock('~/store/wallet', () => ({ useWallet: { getState: () => ({ session: null }) } }))

import * as Sentry from '@sentry/react'
import {
  captureError,
  isLocalhost,
  redact,
  scrubEvent,
  sentryForwarder,
  setErrorForwarder,
  tagsFrom
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

describe('captureError', () => {
  beforeEach(() => setErrorForwarder(null))

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
