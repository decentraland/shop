import { Rarity } from '@dcl/schemas'

export const RARITY_BACKGROUND_COLORS: Record<Rarity, string> = {
  common: '#9696964D',
  uncommon: '#FF836233',
  rare: '#34CE7633',
  epic: '#289CFF4D',
  legendary: '#A14BF34D',
  mythic: '#FF4BED33',
  unique: '#FEA21733',
  exotic: '#3B432C',
}

export const RARITY_TEXT_COLORS: Record<Rarity, string> = {
  common: '#E6E6E6',
  uncommon: '#FF8362',
  rare: '#34CE76',
  epic: '#4bb0eb',
  legendary: '#A657ED',
  mythic: '#FF4BED',
  unique: '#FFF280',
  exotic: '#DBF5B1',
}

// Real per-rarity color (common grey -> mythic pink, etc.) instead of one flat purple wash.
export function rarityColor(rarity?: string | null): { text: string; background: string } {
  if (!rarity) return { text: RARITY_TEXT_COLORS.common, background: RARITY_BACKGROUND_COLORS.common }
  return {
    text: RARITY_TEXT_COLORS[rarity.toLowerCase() as Rarity] || RARITY_TEXT_COLORS.common,
    background: RARITY_BACKGROUND_COLORS[rarity.toLowerCase() as Rarity] || RARITY_BACKGROUND_COLORS.common,
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
