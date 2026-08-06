import { useEffect, useState } from 'react'

/**
 * DEV-only type tweaker for the overview's section headings (?tweak).
 *
 * Dial size, weight, tracking and stroke on the live page, then copy the CSS it prints and paste the
 * values into styles/row.styles Title. Nothing here ships: the panel returns null unless the dev server
 * is running with ?tweak, and it styles the headings through an injected <style> rather than through the
 * component, so the production rule stays a plain styled def with no tweak hooks left in it.
 */

const FIELDS = [
  { key: 'size', label: 'font-size', min: 14, max: 56, step: 1, unit: 'px' },
  { key: 'weight', label: 'font-weight', min: 100, max: 900, step: 100, unit: '' },
  { key: 'tracking', label: 'letter-spacing', min: -2, max: 8, step: 0.1, unit: 'px' },
  { key: 'stroke', label: '-webkit-text-stroke', min: 0, max: 2, step: 0.05, unit: 'px' },
  { key: 'leading', label: 'line-height', min: 0.9, max: 2, step: 0.05, unit: '' }
] as const

type Key = (typeof FIELDS)[number]['key']
type Values = Record<Key, number>

/** The heading's shipped values, so the panel opens on what the page already looks like. */
const DEFAULTS: Values = { size: 20, weight: 600, tracking: 0, stroke: 0, leading: 1.5 }

/** Scoped to the overview's rail headings — the hero is an h1 and stays out of it. */
const TARGET = '.overview h2'

function toCss(v: Values): string {
  return [
    `font-size: ${v.size}px;`,
    `font-weight: ${v.weight};`,
    `letter-spacing: ${v.tracking}px;`,
    `line-height: ${v.leading};`,
    v.stroke > 0 ? `-webkit-text-stroke: ${v.stroke}px currentColor;` : null
  ]
    .filter(Boolean)
    .join('\n  ')
}

export function TypeTweak() {
  const on =
    import.meta.env.DEV && typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('tweak')
  const [vals, setVals] = useState<Values>(DEFAULTS)

  useEffect(() => {
    if (!on) return
    const el = document.createElement('style')
    el.dataset.typeTweak = ''
    document.head.appendChild(el)
    return () => el.remove()
  }, [on])

  useEffect(() => {
    if (!on) return
    const el = document.querySelector<HTMLStyleElement>('style[data-type-tweak]')
    if (el) el.textContent = `${TARGET} {\n  ${toCss(vals)}\n}`
  }, [on, vals])

  if (!on) return null

  return (
    <div
      style={{
        position: 'fixed',
        right: 12,
        bottom: 12,
        zIndex: 99999,
        width: 260,
        padding: 12,
        borderRadius: 10,
        background: 'rgba(10, 4, 18, 0.92)',
        color: '#fff',
        font: '11px/1.6 monospace'
      }}
    >
      <strong>section headings</strong>
      {FIELDS.map(f => (
        <label key={f.key} style={{ display: 'block', marginTop: 6 }}>
          {f.label}: {vals[f.key]}
          {f.unit}
          <input
            type="range"
            min={f.min}
            max={f.max}
            step={f.step}
            value={vals[f.key]}
            style={{ width: '100%' }}
            onChange={e => setVals(v => ({ ...v, [f.key]: Number(e.target.value) }))}
          />
        </label>
      ))}
      <button
        type="button"
        style={{ marginTop: 8, width: '100%', padding: 5 }}
        onClick={() => {
          const css = toCss(vals)
          void navigator.clipboard?.writeText(css).catch(() => {})
          console.log(`[type tweak]\n${css}`)
        }}
      >
        copy css
      </button>
      <button type="button" style={{ marginTop: 4, width: '100%', padding: 5 }} onClick={() => setVals(DEFAULTS)}>
        reset
      </button>
    </div>
  )
}

export default TypeTweak
