import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { theme } from '~/styles/theme'
import * as S from './SalesChart.styles'

export type ChartSeries = {
  label: string
  /** One value per bucket, in order. */
  values: number[]
  /** When each bucket starts, for the tooltip and the table. */
  starts: number[]
}

const HEIGHT = 240
const PAD = { top: 12, right: 12, bottom: 28, left: 48 }

/** Round tick steps (1, 2, 5 × 10ⁿ) so the axis reads 0 / 50 / 100, never 0 / 37 / 74. */
function niceTicks(max: number, whole: boolean, count = 4): number[] {
  if (max <= 0) return [0, 1]
  const raw = max / count
  const power = 10 ** Math.floor(Math.log10(raw))
  const nice = [1, 2, 5, 10].map(m => m * power).find(s => s >= raw) ?? raw
  // A count cannot be half a sale: below one, the step would print "0, 1, 1" once rounded.
  const step = whole ? Math.max(1, nice) : nice
  const top = Math.ceil(max / step) * step
  const ticks: number[] = []
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(Number(v.toFixed(6)))
  return ticks
}

/**
 * The period's sales as a line, with an optional comparison period laid over it bucket for bucket.
 *
 * One axis, one measure: switching between sales and earnings redraws the chart rather than adding a
 * second scale. A crosshair snaps to the nearest bucket on hover, tap and arrow keys, and a hidden table
 * carries every value for screen readers.
 */
export function SalesChart({
  current,
  comparison,
  formatValue,
  formatStart,
  formatTick,
  wholeValues,
  ariaLabel,
  roleDescription,
  dateLabel
}: {
  current: ChartSeries
  comparison?: ChartSeries | null
  formatValue: (value: number) => string
  formatStart: (start: number) => string
  /** The axis's shorter date, when the tooltip's would crowd it; defaults to `formatStart`. */
  formatTick?: (start: number) => string
  /** The values are counts, so the axis steps in whole numbers. */
  wholeValues?: boolean
  ariaLabel: string
  /** What assistive tech calls the plot, which is keyboard-operable rather than a static image. */
  roleDescription: string
  /** The hidden table's first column header. */
  dateLabel: string
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(640)
  const [active, setActive] = useState<number | null>(null)
  const fillId = useId()

  useEffect(() => {
    const el = wrapRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(entries => {
      const next = Math.round(entries[0]?.contentRect.width ?? 0)
      if (next > 0) setWidth(next)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const count = current.values.length
  // A shorter range can leave the kept index past the end; it reads as nothing hovered until the pointer moves.
  const shown = active != null && active < count ? active : null
  const plotW = Math.max(1, width - PAD.left - PAD.right)
  const plotH = HEIGHT - PAD.top - PAD.bottom
  const peak = Math.max(0, ...current.values, ...(comparison?.values ?? []))
  const ticks = useMemo(() => niceTicks(peak, !!wholeValues), [peak, wholeValues])
  const top = ticks[ticks.length - 1] || 1

  const x = (i: number) => PAD.left + (count > 1 ? (i / (count - 1)) * plotW : plotW / 2)
  const y = (v: number) => PAD.top + plotH - (v / top) * plotH
  const path = (values: number[]) =>
    values
      .slice(0, count)
      .map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`)
      .join(' ')

  const line = path(current.values)
  const area = count > 0 ? `${line} L${x(count - 1).toFixed(1)} ${y(0)} L${x(0).toFixed(1)} ${y(0)} Z` : ''
  // Five or so dates along the bottom, always ending on the last bucket; a pick too close to it gives way.
  const labelEvery = Math.max(1, Math.ceil(count / Math.max(2, Math.floor(plotW / 110))))
  const picked: number[] = []
  for (let i = 0; i < count; i += labelEvery) picked.push(i)
  if (count > 0 && picked[picked.length - 1] !== count - 1) {
    if (picked.length > 1 && count - 1 - picked[picked.length - 1] < labelEvery * 0.6) picked.pop()
    picked.push(count - 1)
  }
  const xLabels = picked.map(i => ({ i, start: current.starts[i] }))

  function indexAt(clientX: number): number {
    const rect = wrapRef.current?.getBoundingClientRect()
    if (!rect || count === 0) return 0
    const ratio = (clientX - rect.left - PAD.left) / plotW
    return Math.min(count - 1, Math.max(0, Math.round(ratio * (count - 1))))
  }

  function onPointer(event: PointerEvent) {
    setActive(indexAt(event.clientX))
  }

  function onKey(event: KeyboardEvent) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const from = active ?? (event.key === 'ArrowLeft' ? count : -1)
    setActive(Math.min(count - 1, Math.max(0, from + (event.key === 'ArrowRight' ? 1 : -1))))
  }

  const tipLeft = shown != null ? Math.min(Math.max(x(shown), 96), width - 96) : 0

  return (
    <S.Root>
      <S.Legend aria-hidden>
        <S.Key>
          <S.KeyLine style={{ background: theme.colors.dclRed }} />
          {current.label}
        </S.Key>
        {comparison ? (
          <S.Key>
            <S.KeyLine style={{ background: theme.colors.chartCompare }} />
            {comparison.label}
          </S.Key>
        ) : null}
      </S.Legend>
      <S.Plot
        ref={wrapRef}
        tabIndex={0}
        role="group"
        aria-roledescription={roleDescription}
        aria-label={ariaLabel}
        onPointerMove={onPointer}
        onPointerDown={onPointer}
        onPointerLeave={event => {
          if (event.pointerType === 'mouse') setActive(null)
        }}
        onKeyDown={onKey}
        onBlur={() => setActive(null)}
        data-testid="store-chart"
      >
        <svg width={width} height={HEIGHT} aria-hidden>
          <defs>
            <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={theme.colors.dclRed} stopOpacity="0.18" />
              <stop offset="1" stopColor={theme.colors.dclRed} stopOpacity="0" />
            </linearGradient>
          </defs>
          {ticks.map(tick => (
            <g key={tick}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(tick)} y2={y(tick)} stroke={theme.colors.cardLine} />
              <text x={PAD.left - 8} y={y(tick)} dy="0.32em" textAnchor="end" className="tick">
                {formatValue(tick)}
              </text>
            </g>
          ))}
          {xLabels.map(({ i, start }) => (
            <text
              key={start}
              x={x(i)}
              y={HEIGHT - 8}
              textAnchor={i === 0 ? 'start' : i === count - 1 ? 'end' : 'middle'}
              className="tick"
            >
              {(formatTick ?? formatStart)(start)}
            </text>
          ))}
          {comparison ? (
            <path
              d={path(comparison.values)}
              fill="none"
              stroke={theme.colors.chartCompare}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ) : null}
          <path d={area} fill={`url(#${fillId})`} />
          <path
            d={line}
            fill="none"
            stroke={theme.colors.dclRed}
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {shown != null ? (
            <g>
              <line
                x1={x(shown)}
                x2={x(shown)}
                y1={PAD.top}
                y2={PAD.top + plotH}
                stroke={theme.colors.softWhite}
                strokeOpacity="0.5"
              />
              {comparison && comparison.values[shown] != null ? (
                <circle
                  cx={x(shown)}
                  cy={y(comparison.values[shown])}
                  r="4"
                  fill={theme.colors.chartCompare}
                  className="dot"
                />
              ) : null}
              <circle
                cx={x(shown)}
                cy={y(current.values[shown] ?? 0)}
                r="4"
                fill={theme.colors.dclRed}
                className="dot"
              />
            </g>
          ) : null}
        </svg>
        {shown != null ? (
          <S.Tip style={{ left: tipLeft }} data-testid="store-chart-tip">
            <S.TipRow>
              <S.TipLine style={{ background: theme.colors.dclRed }} />
              <b>{formatValue(current.values[shown] ?? 0)}</b>
              <span>{formatStart(current.starts[shown])}</span>
            </S.TipRow>
            {comparison && comparison.starts[shown] != null ? (
              <S.TipRow>
                <S.TipLine style={{ background: theme.colors.chartCompare }} />
                <b>{formatValue(comparison.values[shown] ?? 0)}</b>
                <span>{formatStart(comparison.starts[shown])}</span>
              </S.TipRow>
            ) : null}
          </S.Tip>
        ) : null}
      </S.Plot>
      <S.Hidden>
        <table>
          <caption>{ariaLabel}</caption>
          <thead>
            <tr>
              <th scope="col">{dateLabel}</th>
              <th scope="col">{current.label}</th>
              {comparison ? <th scope="col">{comparison.label}</th> : null}
            </tr>
          </thead>
          <tbody>
            {current.starts.map((start, i) => (
              <tr key={start}>
                <th scope="row">{formatStart(start)}</th>
                <td>{formatValue(current.values[i] ?? 0)}</td>
                {comparison ? <td>{formatValue(comparison.values[i] ?? 0)}</td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      </S.Hidden>
    </S.Root>
  )
}
