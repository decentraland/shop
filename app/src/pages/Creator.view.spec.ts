import { describe, it, expect } from 'vitest'
import { resolveGridView } from './Creator.view'

/**
 * Three different facts were all reported to the seller as "this creator has no items": a failed request, a
 * filter set that excludes everything, and a creator with genuinely no work. The fourth case is the one that
 * shipped as a bug — the grid resolves to zero while the unfiltered baseline is still in flight, so NO empty
 * state is true yet, and that window rendered nothing at all.
 *
 * Tested as a function rather than through the page on purpose: the interesting case lasts less than a render
 * frame, and asserting it through the component passed with the bug reintroduced — the skeletons were up for
 * the ordinary loading reason instead. Here it is one call.
 */
const base = {
  gridLoading: false,
  gridError: false,
  gridCount: 0,
  baselinePending: false,
  baselineError: false,
  baselineCount: undefined as number | undefined
}

describe('resolveGridView', () => {
  it('shows skeletons while the grid itself is loading', () => {
    expect(resolveGridView({ ...base, gridLoading: true })).toBe('skeletons')
  })

  it('shows items as soon as the grid has any', () => {
    expect(resolveGridView({ ...base, gridCount: 3, baselinePending: true })).toBe('items')
  })

  it('KEEPS SHOWING SKELETONS when the grid is empty but the baseline has not answered', () => {
    // The bug: this returned no view at all, so the page rendered no items, no skeletons and no message.
    expect(resolveGridView({ ...base, baselinePending: true })).toBe('skeletons')
  })

  it('waits on a baseline that is pending because it is DISABLED, not merely slow', () => {
    // TanStack Query v5: a disabled query is pending forever and never "loading". Guarding on isLoading fell
    // through to a message rather than waiting.
    expect(resolveGridView({ ...base, baselinePending: true, baselineCount: undefined })).toBe('skeletons')
  })

  it('says the load failed when the grid failed', () => {
    expect(resolveGridView({ ...base, gridError: true })).toBe('error')
  })

  it('says the load failed when only the baseline failed, rather than guessing', () => {
    expect(resolveGridView({ ...base, baselineError: true })).toBe('error')
  })

  it('distinguishes a creator with no work from filters that exclude everything', () => {
    expect(resolveGridView({ ...base, baselineCount: 0 })).toBe('no-creations')
    expect(resolveGridView({ ...base, baselineCount: 24 })).toBe('filters')
  })

  it('prefers the grid error over any baseline answer', () => {
    // A grid that failed is not an empty grid; the baseline says nothing about that.
    expect(resolveGridView({ ...base, gridError: true, baselineCount: 24 })).toBe('error')
  })
})
