import { Rarity } from '@dcl/schemas'

// Neutral grey for an absent or unrecognized rarity.
const FALLBACK_COLOR = '#a09ba8'

// Real per-rarity color (common grey -> mythic pink, etc.) instead of one flat purple wash.
export function rarityColor(rarity?: string | null): string {
  if (!rarity) return FALLBACK_COLOR
  try {
    // getColor is a plain map lookup: an unrecognized (but non-empty) rarity returns undefined WITHOUT
    // throwing, so coalesce it to the fallback — otherwise readableText(undefined) would crash the card.
    return Rarity.getColor(rarity.toLowerCase() as Rarity) || FALLBACK_COLOR
  } catch {
    return FALLBACK_COLOR
  }
}

// Per-rarity radial gradient (light center → dark edge), matching how the marketplace renders an
// item's image background. Falls back to a neutral grey wash for unknown rarities.
const FALLBACK_GRADIENT = 'radial-gradient(#c0bdc6, #a09ba8)'

export function rarityGradient(rarity?: string | null): string {
  try {
    const [light, dark] = Rarity.getGradient((rarity ?? 'common').toLowerCase() as Rarity)
    // An unknown rarity yields [undefined, undefined] (no throw) — fall back rather than emit a
    // broken `radial-gradient(undefined, undefined)`.
    if (!light || !dark) return FALLBACK_GRADIENT
    return `radial-gradient(${light}, ${dark})`
  } catch {
    return FALLBACK_GRADIENT
  }
}

// Pick black or white text for a solid background by perceived luminance (same threshold the reskin
// uses): light chip -> dark text, dark chip -> white text. Tolerates a non-string (defends against a
// missing color upstream) by falling back to dark text rather than throwing.
export function readableText(hex: string): string {
  const h = typeof hex === 'string' ? hex.replace('#', '') : ''
  if (h.length < 6) return '#161518'
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b
  return luminance > 150 ? '#161518' : '#ffffff'
}
