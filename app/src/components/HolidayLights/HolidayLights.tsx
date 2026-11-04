import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import * as S from './HolidayLights.styles'

/** The width of one sag of wire, from one hook to the next. */
const SPAN_PX = 120

/** How far the wire droops at the middle of a span. */
const SAG_PX = 12

/** Where along each span a bulb hangs. Three per span, so the string reads as dense without crowding. */
const BULB_AT = [0.2, 0.5, 0.8] as const

/** The classic four, cycled in order rather than at random so no two neighbours ever match. */
const COLORS = ['#ff3b4f', '#ffc83d', '#36d97a', '#3cb8ff'] as const

type Bulb = { x: number; y: number; color: string; tilt: number; seconds: number; delay: number }

/** A point on one span's quadratic sag: hooked at both ends, lowest at the middle. */
function sagAt(t: number): number {
  return 4 * SAG_PX * t * (1 - t)
}

function planBulbs(width: number): { wire: string; bulbs: Bulb[] } {
  const spans = Math.max(1, Math.ceil(width / SPAN_PX))
  let wire = 'M0 0'
  const bulbs: Bulb[] = []
  for (let s = 0; s < spans; s++) {
    const x0 = s * SPAN_PX
    wire += ` Q${x0 + SPAN_PX / 2} ${SAG_PX * 2} ${x0 + SPAN_PX} 0`
    BULB_AT.forEach((t, i) => {
      bulbs.push({
        x: x0 + t * SPAN_PX,
        y: sagAt(t),
        color: COLORS[(s * BULB_AT.length + i) % COLORS.length],
        // Hanging bulbs never point straight down: each one follows the slope of the wire it is clipped to.
        tilt: (0.5 - t) * -50,
        seconds: 1.8 + Math.random() * 2.4,
        delay: -Math.random() * 4
      })
    })
  }
  return { wire, bulbs }
}

/**
 * A string of lights hanging off the bottom edge of the sub-nav. Mounted only while the holiday skin is on.
 *
 * Plain SVG and CSS: every bulb twinkles on its own period and phase, which is what keeps forty of them from
 * pulsing in lockstep like a sign. Recomputed from the bar's width, so the string always runs edge to edge
 * and the bulbs stay at the same spacing on any screen.
 */
export function HolidayLights() {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setWidth(el.clientWidth)
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Only the count changes the plan, so a resize that keeps the same number of spans keeps every bulb's
  // twinkle where it was instead of reshuffling the whole string.
  const spans = Math.max(1, Math.ceil(width / SPAN_PX))
  const { wire, bulbs } = useMemo(() => planBulbs(spans * SPAN_PX), [spans])

  return (
    <S.String ref={ref} aria-hidden data-testid="holiday-lights">
      {width ? (
        <svg width={spans * SPAN_PX} height={S.HEIGHT_PX} viewBox={`0 -2 ${spans * SPAN_PX} ${S.HEIGHT_PX}`}>
          <S.Wire d={wire} />
          {bulbs.map((b, i) => (
            <g key={i} transform={`translate(${b.x.toFixed(1)} ${b.y.toFixed(1)}) rotate(${b.tilt.toFixed(1)})`}>
              <S.Socket x={-3} y={-1} width={6} height={6} rx={1.5} />
              <S.Bulb
                data-testid="holiday-bulb"
                style={{
                  ['--bulb' as string]: b.color,
                  ['--twinkle-s' as string]: `${b.seconds.toFixed(2)}s`,
                  ['--twinkle-delay' as string]: `${b.delay.toFixed(2)}s`
                }}
              >
                <path d="M0 4 C5 6 6.5 12 5 16 C3.8 19.5 -3.8 19.5 -5 16 C-6.5 12 -5 6 0 4 Z" />
                <ellipse cx={-1.8} cy={10} rx={1.2} ry={2.8} fill="rgba(255,255,255,0.65)" />
              </S.Bulb>
            </g>
          ))}
        </svg>
      ) : null}
    </S.String>
  )
}

export default HolidayLights
