import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import * as S from './SpiderDrop.styles'

const LottieSpider = lazy(async () => {
  const [{ default: Lottie }, { default: animationData }] = await Promise.all([
    import('lottie-react'),
    import('./spiderAnimation.json')
  ])
  // Once, not looped: the clip is a whole visit — down the thread, a pause, and back up.
  return { default: () => <Lottie animationData={animationData} loop={false} /> }
})

/**
 * One visit end to end: the clip's own ~0.8s descent, a hang, and the climb the styles add on top. Shorter
 * than the clip's full six seconds, which is mostly idle hanging once the drop is done.
 */
const VISIT_MS = 5_200

/** Rarer than the bats: a spider dropping across the page is a bigger interruption than one crossing it. */
const FIRST_DELAY_MS = [7_000, 14_000] as const
const GAP_MS = [22_000, 40_000] as const

type Visit = { id: number; side: 'left' | 'right'; inset: number; size: number; top: number }

/**
 * Where the sub-nav ends, measured rather than assumed.
 *
 * It is 66px tall only on wide viewports: below `lg` the bar wraps its search and tab strips onto their
 * own rows and grows, so a hardcoded offset hangs the spider from INSIDE the nav (measured: 74px too high
 * at 900, 109px at 390). Sticky, so this stays correct as the page scrolls.
 */
function subnavBottom(): number {
  const subnav = document.querySelector('[data-testid="subnav"]')
  if (subnav) return subnav.getBoundingClientRect().bottom
  const navH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-h')) || 92
  return navH + 66
}

function planVisit(id: number): Visit {
  // Near one side or the other, never the middle: it drops past the edge of the content rather than over
  // whatever someone is reading. Anchored to ITS OWN side rather than always to `left`, because a
  // right-hand percentage positions the box's left edge and hangs half the spider off the window.
  return {
    id,
    side: Math.random() < 0.5 ? 'left' : 'right',
    inset: 3 + Math.random() * 9,
    size: visitSize(),
    top: subnavBottom()
  }
}

function between([min, max]: readonly [number, number]): number {
  return min + Math.random() * (max - min)
}

/**
 * The box the clip is drawn into, which is NOT how big the spider looks.
 *
 * Measured on screen: the spider itself is about 21% of the box's height and 17% of its width, because
 * the rest of the frame is the thread it comes down on. So a 235px box draws a 49px spider, which is
 * what made the first pass read as a speck. These sizes put the body at roughly 100 to 140px, and the
 * thread that comes with it is what carries it down over the banner.
 *
 * Clamped against the viewport so the same numbers do not fill a phone screen.
 */
function visitSize(): number {
  const wanted = between([480, 670])
  return Math.min(wanted, window.innerWidth * 0.8, window.innerHeight * 0.8)
}

/**
 * A spider that drops from behind the tab bar now and then, hangs, and climbs back.
 *
 * Same economics as BatFlight: lottie-web is a requestAnimationFrame loop for as long as it is mounted,
 * so each visit mounts, plays its one clip and unmounts rather than idling on the page all session.
 */
export function SpiderDrop() {
  const [play] = useState(() => !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
  const [visible, setVisible] = useState(() => document.visibilityState === 'visible')
  const [visit, setVisit] = useState<Visit | null>(null)
  const nextId = useRef(0)

  useEffect(() => {
    const onChange = () => setVisible(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', onChange)
    return () => document.removeEventListener('visibilitychange', onChange)
  }, [])

  useEffect(() => {
    if (!play || !visible || visit) return
    const timer = window.setTimeout(
      () => setVisit(planVisit(nextId.current++)),
      between(nextId.current === 0 ? FIRST_DELAY_MS : GAP_MS)
    )
    return () => window.clearTimeout(timer)
  }, [play, visible, visit])

  useEffect(() => {
    if (!visit) return
    // Timed rather than driven by lottie's own complete event: the player is behind a lazy boundary, so
    // wiring a callback through it would mean threading a ref across the Suspense split for no gain.
    const timer = window.setTimeout(() => setVisit(null), VISIT_MS)
    return () => window.clearTimeout(timer)
  }, [visit])

  if (!visit) return null

  return (
    <S.Anchor
      aria-hidden
      data-testid="spider-drop"
      style={{
        top: `${visit.top}px`,
        [visit.side]: `${visit.inset}%`,
        ['--spider-size' as string]: `${visit.size}px`,
        ['--visit-ms' as string]: `${VISIT_MS}ms`
      }}
    >
      <S.Body>
        <Suspense fallback={null}>
          <LottieSpider />
        </Suspense>
      </S.Body>
    </S.Anchor>
  )
}

export default SpiderDrop
