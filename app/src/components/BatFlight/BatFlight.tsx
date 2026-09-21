import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import * as S from './BatFlight.styles'

/**
 * The player and the artwork, fetched only once a flight is actually due.
 *
 * Same reasoning as Confetti: lottie-web is ~250KB of runtime for a decoration that most of the year is
 * not on screen at all, so it must never reach the entry chunk. The artwork itself is 13KB of vector.
 */
const LottieBat = lazy(async () => {
  const [{ default: Lottie }, { default: animationData }] = await Promise.all([
    import('lottie-react'),
    import('./batAnimation.json')
  ])
  // Looped, unlike the confetti burst: the 0.82s clip is one wing-flap cycle, and the travel across the
  // screen is the CSS transform underneath it.
  return { default: () => <Lottie animationData={animationData} loop /> }
})

type Flight = {
  id: number
  size: number
  seconds: number
  /** Start and end points, as CSS lengths measured from the centre of the viewport. */
  x1: string
  y1: string
  x2: string
  y2: string
  /** How far the sprite banks into its heading. */
  tilt: number
  facing: 'left' | 'right'
}

/**
 * Often enough to be seen, spaced enough not to read as a metronome.
 *
 * The first pass was a round every 25-55s, and with a 7-11s crossing that left the page empty most of the
 * time — long enough that someone looking for the bats concluded they were broken.
 */
const FIRST_DELAY_MS = [3_000, 7_000] as const
const GAP_MS = [10_000, 22_000] as const

function between([min, max]: readonly [number, number]): number {
  return min + Math.random() * (max - min)
}

/**
 * How far off horizontal a crossing may wander, in radians (about 8 degrees).
 *
 * Bounded rather than free: a bat entering from the top and leaving at the bottom spends most of its
 * flight behind the nav or off the fold, and reads as something falling past the window rather than as
 * something crossing it. Every round enters from a SIDE.
 *
 * Small because the constraint is on the VISIBLE part of the path, not on the angle. A bat rises by
 * `100vw * tan(pitch)` while it crosses, so on a wide window 20 degrees is already ~460px of climb and it
 * leaves through the top or the bottom. At 8 degrees that is ~180px: a clear diagonal that still exits
 * the far side.
 */
const MAX_PITCH = 0.14

function planFlight(id: number, heading: 'left' | 'right'): Flight {
  const pitch = (Math.random() - 0.5) * 2 * MAX_PITCH
  const angle = heading === 'right' ? pitch : Math.PI - pitch
  const dirX = Math.cos(angle)
  const dirY = Math.sin(angle)
  // Far enough out that both ends sit off-screen on any viewport, so the bat is never seen to appear or
  // to stop. vmax because it has to clear the LONGER side whichever way it is heading.
  const reach = 95
  // Pushed off the centre line, in vmin so the offset cannot throw a path off the shorter side. On a
  // near-horizontal heading this is what varies the HEIGHT, so the two bats of a round never share one.
  const drift = (Math.random() - 0.5) * 60
  const perpX = -dirY * drift
  const perpY = dirX * drift

  const at = (k: number) => ({
    x: `calc(${(dirX * k).toFixed(2)}vmax + ${perpX.toFixed(2)}vmin)`,
    y: `calc(${(dirY * k).toFixed(2)}vmax + ${perpY.toFixed(2)}vmin)`
  })
  const from = at(-reach)
  const to = at(reach)

  return {
    id,
    size: 90 + Math.random() * 70,
    seconds: 7 + Math.random() * 4,
    x1: from.x,
    y1: from.y,
    x2: to.x,
    y2: to.y,
    // Banked into the climb or dive, but only partly: a bat pitched the full angle of its path reads as
    // falling rather than flying.
    tilt: Math.round(dirY * 28),
    facing: heading
  }
}

/** A round is a PAIR crossing at once, one each way, at their own heights, sizes and speeds. */
function planRound(firstId: number): Flight[] {
  return [planFlight(firstId, 'right'), planFlight(firstId + 1, 'left')]
}

/**
 * A bat that crosses the viewport now and then. Mounted only while the Halloween skin is on.
 *
 * ONE bat at a time, and nothing at all between flights: lottie-web drives a requestAnimationFrame loop
 * for as long as it is mounted, so a permanently-mounted bat would repaint for the whole session to be
 * visible for eight seconds of it. Each flight mounts, crosses, and unmounts on its own animationend.
 */
export function BatFlight() {
  // A decoration flapping across the page is exactly what prefers-reduced-motion is for, and CSS cannot
  // stop a JS-driven Lottie — so the decision is made here, before anything is fetched. Read once at
  // mount; an absent matchMedia plays, matching Confetti's fail-open.
  const [play] = useState(() => !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
  const [visible, setVisible] = useState(() => document.visibilityState === 'visible')
  const [flights, setFlights] = useState<Flight[]>([])
  const nextId = useRef(0)

  useEffect(() => {
    const onChange = () => setVisible(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', onChange)
    return () => document.removeEventListener('visibilitychange', onChange)
  }, [])

  useEffect(() => {
    // Re-runs once the round has emptied, or when the tab returns to the foreground. A backgrounded tab
    // schedules NOTHING and its pending timer is cleared by the cleanup, so a long absence cannot queue
    // up a swarm to release all at once on return.
    if (!play || !visible || flights.length) return
    const delay = between(nextId.current === 0 ? FIRST_DELAY_MS : GAP_MS)
    const timer = window.setTimeout(() => {
      setFlights(planRound(nextId.current))
      nextId.current += 2
    }, delay)
    return () => window.clearTimeout(timer)
  }, [play, visible, flights.length])

  if (!flights.length) return null

  return (
    <S.Layer aria-hidden data-testid="bat-flight">
      {flights.map(flight => (
        <S.Flight
          key={flight.id}
          style={{
            ['--bat-size' as string]: `${flight.size}px`,
            ['--bat-seconds' as string]: `${flight.seconds}s`,
            ['--x1' as string]: flight.x1,
            ['--y1' as string]: flight.y1,
            ['--x2' as string]: flight.x2,
            ['--y2' as string]: flight.y2
          }}
          // Each bat leaves on its OWN crossing, and the next round is scheduled once the last of them
          // has gone. The bob underneath is infinite and never fires this, but it is a CHILD and
          // animation events bubble, so anything that did would cut a crossing short.
          onAnimationEnd={event => {
            if (event.target !== event.currentTarget) return
            setFlights(current => current.filter(other => other.id !== flight.id))
          }}
        >
          <S.Bob data-facing={flight.facing} style={{ ['--tilt' as string]: `${flight.tilt}deg` }}>
            <Suspense fallback={null}>
              <LottieBat />
            </Suspense>
          </S.Bob>
        </S.Flight>
      ))}
    </S.Layer>
  )
}

export default BatFlight
