import { Rarity } from '@dcl/schemas'
import { capitalizeFirst } from '~/lib/text'

// Per-rarity radial gradient (light center → dark edge), matching how the marketplace renders an
// item's image background. Falls back to a neutral grey wash for unknown rarities.
const FALLBACK_GRADIENT = 'radial-gradient(#c0bdc6, #a09ba8)'
const FALLBACK_COLOR = '#E6E6E6'

// Parse a #rrggbb color to [r, g, b]; null when it isn't a full 6-digit hex (defends against a
// missing/short color upstream so callers can fall back instead of producing NaN channels).
function parseHex(color: string): [number, number, number] | null {
  const h = typeof color === 'string' ? color.replace('#', '') : ''
  if (h.length < 6) return null
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

// Perceived luminance (ITU-R BT.601) of an [r, g, b] triple.
function luminance([r, g, b]: [number, number, number]): number {
  return 0.299 * r + 0.587 * g + 0.114 * b
}

// Real per-rarity color (common grey -> mythic pink, etc.) instead of one flat purple wash.
export function rarityColor(rarity?: string | null): string {
  return rarity ? Rarity.getColor(rarity.toLowerCase() as Rarity) || FALLBACK_COLOR : FALLBACK_COLOR
}

// The marketplace rarity chip is a TINTED chip: the rarity's own color at low alpha for the
// background + the full color for the text (e.g. legendary → rgba(161,75,243,.3) bg / #a14bf3 text).
// Falls back to the neutral color when the hex can't be parsed.
export function rarityTint(rarity?: string | null, alpha = 0.3): string {
  const rgb = parseHex(rarityColor(rarity))
  if (!rgb) return `rgba(160, 155, 168, ${alpha})`
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`
}

// Ink color for the TINTED rarity chip: the rarity's own hue, but darkened enough to stay legible on
// its pale (30% alpha over white) background. Light rarities — exotic (#CAFF73 lime), unique (#FFB626
// amber), common (#ABC1C1 grey) — are near-white and would vanish as text at full saturation, so we
// scale the channels down toward the target luminance while preserving the hue. Dark rarities (epic,
// legendary) already read fine and pass through unchanged.
export function rarityInk(rarity?: string | null, target = 120): string {
  const color = rarityColor(rarity)
  const rgb = parseHex(color)
  if (!rgb) return '#161518'
  const lum = luminance(rgb)
  if (lum <= target) return color
  // Luminance scales linearly with a uniform channel scale, so k = target/lum lands the ink on target.
  const k = target / lum
  const hex = (n: number) =>
    Math.round(n * k)
      .toString(16)
      .padStart(2, '0')
  return `#${hex(rgb[0])}${hex(rgb[1])}${hex(rgb[2])}`
}

// Short tooltip explaining a rarity by its scarcity — every DCL rarity is defined by how many can ever
// be minted (unique = 1 … common = 100,000). Used as the `title` on rarity chips (matches the
// marketplace, which surfaces the same max-supply meaning). Falls back to just the name if unknown.
export function rarityDescription(rarity?: string | null): string {
  const name = capitalizeFirst(rarity ?? 'Common')
  try {
    const max = Rarity.getMaxSupply((rarity ?? 'common').toLowerCase() as Rarity)
    if (max > 0) return `${name} rarity — only ${max.toLocaleString()} can ever be minted`
  } catch {
    /* unknown rarity → name only */
  }
  return `${name} rarity`
}

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
  const rgb = parseHex(hex)
  if (!rgb) return '#161518'
  return luminance(rgb) > 150 ? '#161518' : '#ffffff'
}
