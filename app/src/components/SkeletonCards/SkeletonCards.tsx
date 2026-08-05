import { useEffect, useRef, useState, type ReactNode } from 'react'
import * as S from './SkeletonCards.styles'

// Placeholder cards shown while a grid or rail loads — on first load and while fetching the next page.
// Purely decorative → aria-hidden, but testid'd: "is the loading state showing" is exactly what a spec
// needs to assert, and counting anonymous aria-hidden divs breaks as soon as anything else is hidden.
//
// `settling` marks the copies inside a SkeletonSettle layer — the ones fading out over the cards that
// arrived. They carry their own testid so a spec counting the LOADING skeletons can never count the
// exit animation's as well.
export function SkeletonCards({ count = 12, settling }: { count?: number; settling?: boolean }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <S.SkeletonCard key={i} aria-hidden data-testid={settling ? 'skeleton-card-settling' : 'skeleton-card'} />
      ))}
    </>
  )
}

// The same, shaped as an OUTFIT card ("Shop the look") instead of an item card — a 27:40 box carrying
// the look's headroom, not a 300px tile. Same rules: decorative, testid'd, settling-aware.
export function SkeletonOutfitCards({ count = 5, settling }: { count?: number; settling?: boolean }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <S.SkeletonOutfitCard
          key={i}
          aria-hidden
          data-testid={settling ? 'skeleton-outfit-card-settling' : 'skeleton-outfit-card'}
        />
      ))}
    </>
  )
}

/**
 * Crossfades a rail's skeletons out over the content that replaced them.
 *
 * Mount it as a sibling of the rail, inside a positioned box (a rail's Viewport), holding a copy of the
 * skeleton rail — the same styled track the real cards go in, so the fading copy cannot drift from what
 * it covers at any breakpoint.
 *
 * It renders nothing until `loading` goes false, then holds the fading copy for the length of the fade
 * and unmounts it. The unmount is a timer rather than an animationend listener on purpose: under
 * prefers-reduced-motion the layer has no animation to end (it is display: none), and a listener that
 * never fires would leave the copy in the DOM for good.
 */
export function SkeletonSettle({ loading, children }: { loading: boolean; children: ReactNode }) {
  const [settling, setSettling] = useState(false)
  const wasLoading = useRef(loading)

  useEffect(() => {
    if (wasLoading.current && !loading) setSettling(true)
    wasLoading.current = loading
  }, [loading])

  useEffect(() => {
    if (!settling) return
    const timer = setTimeout(() => setSettling(false), S.SETTLE_MS)
    return () => clearTimeout(timer)
  }, [settling])

  if (!settling) return null
  return (
    <S.SkeletonSettleLayer aria-hidden data-testid="skeleton-settle">
      {children}
    </S.SkeletonSettleLayer>
  )
}

export default SkeletonCards
