import { describe, it, expect, vi, beforeEach } from 'vitest'

// Keep monitoring isolated: no real config/wallet needed for the pure helpers.
vi.mock('~/config', () => ({ config: { sentryDsn: '', sentryEnvironment: 'test', sentryRelease: 'shop@test' } }))
vi.mock('~/store/wallet', () => ({ useWallet: { getState: () => ({ session: null }) } }))

// eslint-disable-next-line import/first
import { captureError, redact, scrubEvent, setErrorForwarder } from '~/lib/monitoring'

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
