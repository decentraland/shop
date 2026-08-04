/**
 * WHAT THE CREATOR GRID SHOWS — the whole decision, in one place.
 *
 * The page needs TWO answers before it can be honest: the filtered grid, and an unfiltered baseline count
 * that says whether this creator has published anything at all. Three different facts were all reported as
 * "this creator has no items": a failed request, a filter set that excludes everything, and a creator with
 * genuinely no work.
 *
 * It lives here as a pure function rather than as a chain of ternaries in the component because the
 * interesting case is a TIMING one — the grid can resolve to zero while the baseline is still in flight, and
 * in that window no empty state is true yet. That window rendered nothing at all: no items, no skeletons, no
 * message, which reads as a broken page rather than a loading one. Reproducing a sub-render-frame window
 * through the component is unreliable; as a function it is one call.
 */
export type GridView = 'skeletons' | 'items' | 'error' | 'no-creations' | 'filters'

export function resolveGridView(input: {
  gridLoading: boolean
  gridError: boolean
  gridCount: number
  /**
   * `isPending`, not `isLoading`: in TanStack Query v5 a DISABLED query is pending but never loading, so a
   * render where the baseline does not run must still wait rather than fall through to a wrong message.
   */
  baselinePending: boolean
  baselineError: boolean
  baselineCount: number | undefined
}): GridView {
  const { gridLoading, gridError, gridCount, baselinePending, baselineError, baselineCount } = input

  if (gridLoading) return 'skeletons'
  if (gridError) return 'error'
  if (gridCount > 0) return 'items'
  // The grid is empty. WHICH empty state is true depends on the baseline, so keep loading until it answers.
  if (baselinePending) return 'skeletons'
  if (baselineError) return 'error'
  return baselineCount === 0 ? 'no-creations' : 'filters'
}
