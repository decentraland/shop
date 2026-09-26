import { useEffect, useRef, useState } from 'react'
import batUrl from './bat.svg'
import { between } from '~/lib/random'
import * as S from './BatBurst.styles'

type Bat = { dx: number; dy: number; rot: number; size: number; scale: number; dur: number; delay: number }

/**
 * Where the bats come FROM, and therefore which way they go.
 *
 * `center` sprays in a full circle, for a burst on a small control. The edge origins sit on their side of
 * the container and fan OUTWARD, which is what makes a card look like it disturbed something rather than
 * like it contains a firework.
 */
export type BurstFrom = 'center' | 'left' | 'right'

/** Fewer per side, because an edge burst is rendered twice — once per side — for the same moment. */
const COUNT: Record<BurstFrom, number> = { center: 7, left: 4, right: 4 }

/** The longest a burst can last, so the caller can be told when to unmount it. */
const LIFETIME_MS = 1_150

/** The arc each origin sprays into, in radians, as [start, size]. */
const ARC: Record<BurstFrom, readonly [number, number]> = {
  center: [0, Math.PI * 2],
  // Screen coordinates, so y grows downward: this is the half-circle pointing left, and its mirror.
  left: [Math.PI / 2, Math.PI],
  right: [-Math.PI / 2, Math.PI]
}

function planBats(from: BurstFrom): Bat[] {
  const count = COUNT[from]
  const [start, size] = ARC[from]
  return Array.from({ length: count }, (_, i) => {
    // Jittered off the even spoke so a handful of them do not read as a snowflake.
    const angle = start + ((i + 0.5) * size) / count + (Math.random() - 0.5) * (size / count) * 0.7
    const distance = between(from === 'center' ? [46, 92] : [34, 76])
    return {
      dx: Math.cos(angle) * distance,
      dy: Math.sin(angle) * distance,
      rot: (Math.random() - 0.5) * 140,
      size: 16 + Math.random() * 12,
      scale: 0.75 + Math.random() * 0.5,
      dur: 780 + Math.random() * 320,
      delay: Math.random() * 90
    }
  })
}

/**
 * A handful of bats scattering from the centre of their container. Plays once on mount.
 *
 * Deliberately NOT a Lottie: a burst is several bats at once and every Lottie instance is its own
 * requestAnimationFrame loop over its own canvas, so a spammed control would stack them. These are copies
 * of ONE cached SVG moved by CSS, which costs a single asset request for the whole session.
 *
 * The container needs `position: relative`; the burst is zero-sized and non-interactive, so it changes
 * neither layout nor hit-testing.
 */
export function BatBurst({ from = 'center', onDone }: { from?: BurstFrom; onDone?: () => void }) {
  // Read once at mount: a burst is a one-shot, so reacting to a mid-flight settings change could only cut
  // it off. An absent matchMedia plays, matching Confetti and BatFlight.
  const [bats] = useState(() => (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? [] : planBats(from)))

  // Held in a ref so an inline `onDone={() => …}` from the caller cannot restart the timer on every
  // render, which would keep the burst alive for as long as its parent re-renders.
  const done = useRef(onDone)
  done.current = onDone

  useEffect(() => {
    // Reported on a timer rather than on animationend: with seven staggered bats the caller would
    // otherwise unmount on the FIRST one to land and take the other six off screen with it.
    const timer = window.setTimeout(() => done.current?.(), bats.length ? LIFETIME_MS : 0)
    return () => window.clearTimeout(timer)
  }, [bats.length])

  if (!bats.length) return null

  return (
    <S.Origin aria-hidden data-from={from} data-testid="bat-burst">
      {bats.map((bat, i) => (
        <S.Bat
          key={i}
          src={batUrl}
          alt=""
          style={{
            ['--dx' as string]: `${bat.dx}px`,
            ['--dy' as string]: `${bat.dy}px`,
            ['--rot' as string]: `${bat.rot}deg`,
            ['--size' as string]: `${bat.size}px`,
            ['--scale' as string]: bat.scale,
            ['--dur' as string]: `${bat.dur}ms`,
            ['--delay' as string]: `${bat.delay}ms`
          }}
        />
      ))}
    </S.Origin>
  )
}

export default BatBurst
