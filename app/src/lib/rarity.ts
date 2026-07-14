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

// The marketplace rarity chip is a TINTED chip: the rarity's own color at low alpha for the
// background + the full color for the text (e.g. legendary → rgba(161,75,243,.3) bg / #a14bf3 text).
// Falls back to the neutral color when the hex can't be parsed.
export function rarityTint(rarity?: string | null, alpha = 0.3): string {
  const h = rarityColor(rarity).replace('#', '')
  if (h.length < 6) return `rgba(160, 155, 168, ${alpha})`
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

// Ink color for the TINTED rarity chip: the rarity's own hue, but darkened enough to stay legible on
// its pale (30% alpha over white) background. Light rarities — exotic (#CAFF73 lime), unique (#FFB626
// amber), common (#ABC1C1 grey) — are near-white and would vanish as text at full saturation, so we
// scale the channels down toward the target luminance while preserving the hue. Dark rarities (epic,
// legendary) already read fine and pass through unchanged.
export function rarityInk(rarity?: string | null, target = 120): string {
  const h = rarityColor(rarity).replace('#', '')
  if (h.length < 6) return '#161518'
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  const lum = 0.299 * r + 0.587 * g + 0.114 * b
  if (lum <= target) return `#${h}`
  // Luminance scales linearly with a uniform channel scale, so k = target/lum lands the ink on target.
  const k = target / lum
  const hex = (n: number) => Math.round(n * k).toString(16).padStart(2, '0')
  return `#${hex(r)}${hex(g)}${hex(b)}`
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
