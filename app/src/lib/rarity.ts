import { t } from '~/intl/i18n'
import { Rarity } from '@dcl/schemas'
import { capitalizeFirst } from '~/lib/text'
import { rarities } from '~/styles/theme'

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

// Real per-rarity color (common cyan -> mythic pink, etc.) instead of one flat purple wash.
//
// Reads the DESIGN's palette (theme.rarities, the Figma "Rarities/*" variables) rather than
// @dcl/schemas' Rarity.getColor: the designer re-tuned all eight for the dark field, so every one
// differs (legendary #842dda -> #a24bf3, common #abc1c1 -> #73d3d3, …). The schema stays the fallback
// for a rarity the design has no token for, then the neutral grey.
export function rarityColor(rarity?: string | null): string {
  if (!rarity) return FALLBACK_COLOR
  const key = rarity.toLowerCase()
  return rarities[key as keyof typeof rarities] || Rarity.getColor(key as Rarity) || FALLBACK_COLOR
}

// The marketplace rarity chip is a TINTED chip: the rarity's own color at low alpha for the
// background + the full color for the text (e.g. legendary → rgba(161,75,243,.3) bg / #a14bf3 text).
// Falls back to the neutral color when the hex can't be parsed.
export function rarityTint(rarity?: string | null, alpha = 0.3): string {
  const rgb = parseHex(rarityColor(rarity))
  if (!rgb) return `rgba(160, 155, 168, ${alpha})`
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`
}

// Glow-only palette. Exotic's #9cd71e is a yellow-green that goes radioactive blown up to a page-sized
// light, and browns as it fades: the purple field's complement sits at hue ~100, so a color near it
// mixes to mud on the way out. Exotic moves to a green clear of that and takes 15% off the shared core
// saturation — the hue is what keeps it out of the mud, the punch is what made it glare — and rare to a
// jade far enough round to stay distinct from it. Chips, filters and links keep their tokens.
const GLOW_COLORS: Record<string, { color: string; saturation?: number }> = {
  exotic: { color: '#44c75b', saturation: 0.81 },
  rare: { color: '#3fd39a' }
}

function glowEntry(rarity?: string | null) {
  return GLOW_COLORS[(rarity ?? '').toLowerCase()]
}

function glowColor(rarity?: string | null): string {
  return glowEntry(rarity)?.color || rarityColor(rarity)
}

// The glow's outer halo, as a bare "r g b" triple for the rgb(R G B / a) stops that need the same hue
// at more than one alpha. Neutral grey when the hex can't be parsed.
export function rarityGlowRgb(rarity?: string | null): string {
  const rgb = parseHex(glowColor(rarity))
  return rgb ? rgb.join(' ') : '160 155 168'
}

// The glow's hot centre: the same hue pushed to near-max saturation at a fixed lightness. Levels the
// rarities out — legendary and epic sit close to the page's purple and sink into it at their token
// value, while unique is already bright — so every item is backlit as strongly and only the hue changes.
export function rarityGlowCoreRgb(rarity?: string | null, lightness = 0.66, saturation?: number): string {
  const rgb = parseHex(glowColor(rarity))
  if (!rgb) return '160 155 168'
  const sat = saturation ?? glowEntry(rarity)?.saturation ?? 0.95
  const [r, g, b] = rgb.map(c => c / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min
  // Achromatic (the neutral fallback color): there is no hue to saturate, and pretending otherwise
  // would invent one — grey has a hue angle of 0, i.e. red.
  if (!delta) return rgb.join(' ')
  let hue: number
  if (max === r) hue = (g - b) / delta
  else if (max === g) hue = (b - r) / delta + 2
  else hue = (r - g) / delta + 4
  hue = (((hue * 60) % 360) + 360) % 360
  const chroma = (1 - Math.abs(2 * lightness - 1)) * sat
  const second = chroma * (1 - Math.abs(((hue / 60) % 2) - 1))
  const lift = lightness - chroma / 2
  const sector = [
    [chroma, second, 0],
    [second, chroma, 0],
    [0, chroma, second],
    [0, second, chroma],
    [second, 0, chroma],
    [chroma, 0, second]
  ][Math.floor(hue / 60) % 6]
  return sector.map(channel => Math.round((channel + lift) * 255)).join(' ')
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
/**
 * A rarity's display name, translated. The API answers in English ('uncommon'), and every surface used to
 * render that string raw — so a Spanish reader saw the filter, the card chip and the tooltip in English
 * while the marketplace showed them "Poco común".
 */
const RARITY_KEYS = ['common', 'uncommon', 'epic', 'rare', 'legendary', 'exotic', 'mythic', 'unique']

export function rarityLabel(rarity?: string | null): string {
  const key = (rarity ?? '').toLowerCase()
  // Unknown rarities keep the API's own word rather than becoming a missing-key warning.
  return RARITY_KEYS.includes(key) ? t(`rarity.${key}`) : capitalizeFirst(rarity ?? '')
}

export function rarityDescription(rarity?: string | null): string {
  const name = rarityLabel(rarity ?? 'common')
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
