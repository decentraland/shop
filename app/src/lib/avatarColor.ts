// Mirrors decentraland/unity-explorer's NameColorHelper + Profile.GenerateAndValidateName (and the
// decentraland.org LandingNavbar) so the shop produces the SAME deterministic avatar background color
// as the in-world client and the global navbar (ADR-292). Algorithm: validate the name to
// alphanumeric Unicode, append `#<last4 of address>` when the user has no claimed name, FNV-1a 32-bit
// over UTF-16 code units, then HSV(hue, 0.75, 1) → sRGB hex.

const FNV_OFFSET_BASIS = 0x811c9dc5
const FNV_PRIME = 0x01000193
const UINT32_MAX = 0xffffffff

const SATURATION = 0.75
const VALUE = 1
const DEFAULT_COLOR = '#ffffff'
// Brand violet used to override the deterministic per-user color for the Decentraland Foundation row.
export const DCL_FOUNDATION_BACKGROUND_COLOR = '#9d76e3'

export interface DisplayNameInput {
  name: string | undefined | null
  hasClaimedName: boolean | undefined | null
  ethAddress: string | undefined | null
}

interface Rgb {
  r: number
  g: number
  b: number
}

const ALPHANUMERIC_REGEX = /[\p{L}\p{N}]/u

export function fnv1a32(input: string): number {
  // Math.imul keeps the multiplication inside int32 modular arithmetic so the result matches C#'s
  // `uint` overflow semantics; `>>> 0` re-casts to uint32.
  let hash = FNV_OFFSET_BASIS >>> 0
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, FNV_PRIME) >>> 0
  }
  return hash >>> 0
}

function hsvToRgb(hue: number, saturation: number, value: number): Rgb {
  const wrappedHue = hue >= 1 ? hue - Math.floor(hue) : hue
  const sextant = Math.floor(wrappedHue * 6)
  const fraction = wrappedHue * 6 - sextant
  const p = value * (1 - saturation)
  const q = value * (1 - saturation * fraction)
  const t = value * (1 - saturation * (1 - fraction))
  switch (sextant % 6) {
    case 0:
      return { r: value, g: t, b: p }
    case 1:
      return { r: q, g: value, b: p }
    case 2:
      return { r: p, g: value, b: t }
    case 3:
      return { r: p, g: q, b: value }
    case 4:
      return { r: t, g: p, b: value }
    default:
      return { r: value, g: p, b: q }
  }
}

function toHexComponent(channel: number): string {
  const clamped = Math.max(0, Math.min(255, Math.round(channel * 255)))
  return clamped.toString(16).padStart(2, '0')
}

function rgbToHex({ r, g, b }: Rgb): string {
  return `#${toHexComponent(r)}${toHexComponent(g)}${toHexComponent(b)}`
}

function getValidatedName(rawName: string | undefined | null): string {
  if (!rawName) return ''
  let validated = ''
  // Iterate per UTF-16 code unit to match C#'s `foreach (char c in name)`. Surrogate halves are not
  // letters or digits in either runtime, so emoji are filtered identically in both.
  for (let i = 0; i < rawName.length; i++) {
    const ch = rawName[i]
    if (ALPHANUMERIC_REGEX.test(ch)) validated += ch
  }
  return validated
}

export function getDisplayName({ name, hasClaimedName, ethAddress }: DisplayNameInput): string {
  const validated = getValidatedName(name)
  if (!validated) return ''
  if (hasClaimedName) return validated
  if (!ethAddress || ethAddress.length <= 4) return validated
  return `${validated}#${ethAddress.slice(-4)}`
}

export function getAvatarBackgroundColor(displayName: string | undefined | null): string {
  if (!displayName) return DEFAULT_COLOR
  const hash = fnv1a32(displayName)
  const hue = hash / UINT32_MAX
  return rgbToHex(hsvToRgb(hue, SATURATION, VALUE))
}
