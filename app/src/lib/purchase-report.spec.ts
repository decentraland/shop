import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Reporting the transaction a credit went out in.
 *
 * The behaviour worth pinning is not that it reports — it is that it can NEVER interfere. It runs right after
 * a transaction has been broadcast to the chain, at a point where nothing is recoverable, and it exists only
 * to improve the buyer's history afterwards. So every failure mode has to be swallowed: no session, a
 * rejected request, a server without the endpoint. Losing a report costs one hidden failed purchase, which is
 * exactly the behaviour that existed before it.
 */
const { reportIntentSubmission, captureError, getState } = vi.hoisted(() => ({
  reportIntentSubmission: vi.fn(),
  captureError: vi.fn(),
  getState: vi.fn()
}))

vi.mock('~/lib/credits', () => ({ reportIntentSubmission }))
vi.mock('~/lib/monitoring', () => ({ captureError }))
vi.mock('~/store/wallet', () => ({ useWallet: { getState } }))

import { reportSubmittedTx } from '~/lib/purchase-report'

const IDENTITY = { authChain: [] } as never
const SALTS = ['0xsalt-a', '0xsalt-b']
const TX_HASH = '0xtx'

beforeEach(() => {
  vi.clearAllMocks()
  getState.mockReturnValue({ session: { identity: IDENTITY } })
  reportIntentSubmission.mockResolvedValue(2)
})

describe('when a group of credits has been broadcast', () => {
  it('should report every salt of that transaction', () => {
    reportSubmittedTx({ txHash: TX_HASH, salts: SALTS })

    expect(reportIntentSubmission).toHaveBeenCalledWith(IDENTITY, SALTS, TX_HASH)
  })

  it('should not wait on the request', () => {
    // Returns void, so a caller cannot accidentally await it into the critical path.
    expect(reportSubmittedTx({ txHash: TX_HASH, salts: SALTS })).toBeUndefined()
  })
})

describe('when there is nothing worth reporting', () => {
  it('should do nothing without salts', () => {
    reportSubmittedTx({ txHash: TX_HASH, salts: [] })

    expect(reportIntentSubmission).not.toHaveBeenCalled()
  })

  it('should do nothing without a transaction hash', () => {
    reportSubmittedTx({ txHash: '', salts: SALTS })

    expect(reportIntentSubmission).not.toHaveBeenCalled()
  })
})

describe('when the session is gone', () => {
  // A checkout can outlive the session it started in — a disconnect mid-flight. There is no identity to sign
  // with, and this is not the place to surface that.
  it('should do nothing when there is no session', () => {
    getState.mockReturnValue({ session: null })

    reportSubmittedTx({ txHash: TX_HASH, salts: SALTS })

    expect(reportIntentSubmission).not.toHaveBeenCalled()
  })

  it('should do nothing when the session carries no identity', () => {
    getState.mockReturnValue({ session: { identity: undefined } })

    reportSubmittedTx({ txHash: TX_HASH, salts: SALTS })

    expect(reportIntentSubmission).not.toHaveBeenCalled()
  })

  it('should not throw when reading the store throws', () => {
    getState.mockImplementation(() => {
      throw new Error('store exploded')
    })

    expect(() => reportSubmittedTx({ txHash: TX_HASH, salts: SALTS })).not.toThrow()
    expect(reportIntentSubmission).not.toHaveBeenCalled()
  })
})

/**
 * Every one of these used to return in silence, and that is why a 7.5% record rate could sit unexplained for
 * a week: the four ways of declining to send were indistinguishable from a purchase that never happened. What
 * these tests pin is that each one now names itself on the way out — while still never throwing, and still
 * never reaching the server.
 */
describe('when it gives up before reporting', () => {
  it.each([
    ['nothing to report', () => reportSubmittedTx({ txHash: TX_HASH, salts: [] })],
    ['nothing to report', () => reportSubmittedTx({ txHash: '', salts: SALTS })]
  ])('should name %s rather than returning silently', (reason, act) => {
    act()

    expect(reportIntentSubmission).not.toHaveBeenCalled()
    expect(captureError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ reason }))
  })

  it('should name a missing identity, which is the leading suspect for the ones we never see', () => {
    getState.mockReturnValue({ session: { identity: undefined } })

    reportSubmittedTx({ txHash: TX_HASH, salts: SALTS })

    expect(reportIntentSubmission).not.toHaveBeenCalled()
    expect(captureError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ reason: 'no identity in the wallet store' })
    )
  })

  it('should report a throwing store and still not throw', () => {
    const boom = new Error('store exploded')
    getState.mockImplementation(() => {
      throw boom
    })

    expect(() => reportSubmittedTx({ txHash: TX_HASH, salts: SALTS })).not.toThrow()
    expect(captureError).toHaveBeenCalledWith(boom, expect.objectContaining({ reason: 'wallet store threw' }))
  })

  // The nastiest of the four: a 200 whose `recorded: 0` means the salts matched no row of this wallet. The
  // server says so quietly by design, so from here it looked exactly like success.
  it('should report a 200 that stamped nothing', async () => {
    reportIntentSubmission.mockResolvedValue(0)

    reportSubmittedTx({ txHash: TX_HASH, salts: SALTS })

    await vi.waitFor(() =>
      expect(captureError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({ reason: 'server recorded 0 rows' })
      )
    )
  })

  it('should stay quiet when rows were stamped', async () => {
    reportIntentSubmission.mockResolvedValue(2)

    reportSubmittedTx({ txHash: TX_HASH, salts: SALTS })

    await vi.waitFor(() => expect(reportIntentSubmission).toHaveBeenCalled())
    expect(captureError).not.toHaveBeenCalled()
  })
})

describe('when the report itself fails', () => {
  // THE point of the module: the transaction is already on the chain. A failed report must be observable to
  // us and invisible to the buyer's checkout.
  it('should swallow the rejection and record it', async () => {
    const failure = new Error('502 from credits-server')
    reportIntentSubmission.mockRejectedValue(failure)

    expect(() => reportSubmittedTx({ txHash: TX_HASH, salts: SALTS })).not.toThrow()

    await vi.waitFor(() =>
      expect(captureError).toHaveBeenCalledWith(failure, {
        flow: 'report-submitted-tx',
        reason: 'request failed'
      })
    )
  })

  it('should not leave the rejection unhandled', async () => {
    reportIntentSubmission.mockRejectedValue(new Error('nope'))

    reportSubmittedTx({ txHash: TX_HASH, salts: SALTS })

    // An unhandled rejection here would surface as a process-level warning (and fail CI on some setups);
    // awaiting a tick after the catch has run is what proves it was handled.
    await vi.waitFor(() => expect(captureError).toHaveBeenCalled())
  })
})
