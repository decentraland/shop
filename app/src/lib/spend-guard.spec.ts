import { describe, it, expect } from 'vitest'
import { createSpendGuard } from '~/lib/spend-guard'

/**
 * The release decision, in isolation.
 *
 * Every case here is one a single per-component boolean got wrong or could not express. The scenarios are
 * named after what happens to the buyer, because that is what the assertions are about: whether their credits
 * get handed back after being spent (balance corruption) or held after not being spent (stranded until TTL).
 */
describe('when deciding whether a reservation may still be released', () => {
  it('should allow a release before anything is submitted', () => {
    const guard = createSpendGuard()

    expect(guard.mayBeConsumed('credit-1')).toBe(false)
  })

  it('should refuse a release once the transaction is broadcast', () => {
    const guard = createSpendGuard()
    guard.broadcast('credit-1', '0xfirst')

    expect(guard.mayBeConsumed('credit-1')).toBe(true)
  })

  it('should allow a release again once that transaction is known to have reverted', () => {
    const guard = createSpendGuard()
    guard.broadcast('credit-1', '0xfirst')
    guard.reverted('0xfirst')

    // A revert rolled the call back, so the credit is untouched — releasing is not just safe here, it is
    // required, or that much of the buyer's balance sits idle until the TTL.
    expect(guard.mayBeConsumed('credit-1')).toBe(false)
  })

  /**
   * THE P1 THE BOOLEAN GOT WRONG.
   *
   * Attempt 1 goes out and its outcome is never observed (replaced transaction, dropped socket). The buyer
   * retries — the CTA stays enabled on the error phase — and attempt 2 mines and REVERTS, because attempt 1
   * actually filled the trade. A single flag reads that revert as "nothing was consumed" and hands back a
   * credit attempt 1 spent.
   */
  it('should keep refusing after a retry reverts, when an earlier attempt never resolved', () => {
    const guard = createSpendGuard()
    guard.broadcast('credit-1', '0xfirst') // outcome never observed
    guard.broadcast('credit-1', '0xsecond') // the retry
    guard.reverted('0xsecond')

    expect(guard.mayBeConsumed('credit-1')).toBe(true)
  })

  it('should allow a release when every attempt is known to have reverted', () => {
    const guard = createSpendGuard()
    guard.broadcast('credit-1', '0xfirst')
    guard.broadcast('credit-1', '0xsecond')
    guard.reverted('0xfirst')
    guard.reverted('0xsecond')

    expect(guard.mayBeConsumed('credit-1')).toBe(false)
  })

  /**
   * The relayer answered with neither a hash nor a rejection — a proxy 502, a reset connection. It may have
   * submitted before dying, and there is no hash to key a later revert on, so this credit can never be
   * cleared. Unclearable is the point: the alternative is re-submitting a credit that is already spent.
   */
  it('should refuse a release forever when a submit could not be observed', () => {
    const guard = createSpendGuard()
    guard.unobservable('credit-1')
    // Even a subsequent, definitively reverted attempt does not clear it.
    guard.broadcast('credit-1', '0xlater')
    guard.reverted('0xlater')

    expect(guard.mayBeConsumed('credit-1')).toBe(true)
  })

  it('should keep each credit independent', () => {
    const guard = createSpendGuard()
    guard.broadcast('credit-1', '0xfirst')

    // `confirmCombined` releases the full-price reservation and reserves a smaller one; one being spent must
    // say nothing about the other.
    expect(guard.mayBeConsumed('credit-2')).toBe(false)
    expect(guard.mayBeConsumed('credit-1')).toBe(true)
  })

  it('should not let one credit be cleared by another credit reverting', () => {
    const guard = createSpendGuard()
    guard.broadcast('credit-1', '0xfirst')
    guard.broadcast('credit-2', '0xsecond')
    guard.reverted('0xsecond')

    expect(guard.mayBeConsumed('credit-1')).toBe(true)
    expect(guard.mayBeConsumed('credit-2')).toBe(false)
  })
})

/**
 * IN-FLIGHT is a separate question from what is KNOWN.
 *
 * While a submit is awaiting, no broadcast has been reported yet — but the wallet prompt may be open, or the
 * relayer may be mid-round-trip. A caller that can fire during that window (the effect cleanup on unmount)
 * must not release, while the buy's own catch — which runs after the submit settles — decides on knowledge.
 */
describe('while a submit is in flight', () => {
  it('should report the submit as in flight even though nothing is known yet', () => {
    const guard = createSpendGuard()
    guard.submitStarted('credit-1')

    expect(guard.isInFlight('credit-1')).toBe(true)
    // Nothing has been reported, so the knowledge-based answer is still "safe to release" — which is why the
    // unmount path has to consult BOTH.
    expect(guard.mayBeConsumed('credit-1')).toBe(false)
  })

  it('should stop reporting it once the submit settles', () => {
    const guard = createSpendGuard()
    guard.submitStarted('credit-1')
    guard.submitFinished('credit-1')

    expect(guard.isInFlight('credit-1')).toBe(false)
  })

  it('should track flights per credit', () => {
    const guard = createSpendGuard()
    guard.submitStarted('credit-1')

    expect(guard.isInFlight('credit-2')).toBe(false)
  })
})
