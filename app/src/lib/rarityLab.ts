/**
 * TEMPORARY A/B scaffold for the card rarity background, shipped so the team can compare both
 * treatments on the preview deploy and pick one. NOT dev-gated, on purpose — a production build strips
 * `import.meta.env.DEV` branches, and the whole point is that this works on the Vercel preview.
 *
 * DELETE BEFORE MERGE: this file, <RarityLab>, and the delegation in lib/rarity's rarityMedia. The
 * winning formula becomes rarityMedia's body.
 *
 * `?rg=a|b` pins a variant to THAT TAB (sessionStorage), so two windows can sit side by side.
 */
import { Rarity } from '@dcl/schemas'
import { rarities } from '~/styles/theme'

type Rgb = [number, number, number]

function parseHex(color: string): Rgb | null {
  const h = typeof color === 'string' ? color.replace('#', '') : ''
  if (h.length < 6) return null
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

// The Shop's own design palette — the same hues as the card's rarity chip.
function shopRgb(rarity?: string | null): Rgb {
  const key = (rarity ?? '').toLowerCase()
  const hex = rarities[key as keyof typeof rarities] || Rarity.getColor(key as Rarity) || '#E6E6E6'
  return parseHex(hex) ?? [230, 230, 230]
}

const rgba = ([r, g, b]: Rgb, a: number) => `rgba(${r}, ${g}, ${b}, ${a})`

export const RARITY_LAB: Record<string, { label: string; build: (rarity?: string | null) => string }> = {
  a: {
    // Light at the centre so the artwork still recuts, colour gathering toward the edges. Tinted from
    // the Shop palette, so the wash and the card's own rarity chip are the same hue.
    label: 'A · tinted wash',
    build: r => {
      const c = shopRgb(r)
      return `radial-gradient(circle at 50% 38%, ${rgba(c, 0.04)} 0%, ${rgba(c, 0.3)} 50%, ${rgba(c, 0.62)} 100%)`
    }
  },
  b: {
    // The raw gradient unity-explorer and the old marketplace paint behind every item.
    label: 'B · explorer parity',
    build: r => {
      try {
        const [light, dark] = Rarity.getGradient((r ?? 'common').toLowerCase() as Rarity)
        if (!light || !dark) return 'none'
        return `radial-gradient(${light}, ${dark})`
      } catch {
        return 'none'
      }
    }
  }
}

export const RARITY_LAB_DEFAULT = 'a'
const KEY = 'shop:rg'

/** The variant pinned to THIS TAB. `?rg=x` sets it; sessionStorage keeps it across SPA navigation. */
export function labVariant(): string {
  if (typeof window === 'undefined') return RARITY_LAB_DEFAULT
  try {
    const q = new URLSearchParams(window.location.search).get('rg')
    if (q && RARITY_LAB[q]) {
      window.sessionStorage.setItem(KEY, q)
      return q
    }
    const stored = window.sessionStorage.getItem(KEY)
    return stored && RARITY_LAB[stored] ? stored : RARITY_LAB_DEFAULT
  } catch {
    return RARITY_LAB_DEFAULT
  }
}
