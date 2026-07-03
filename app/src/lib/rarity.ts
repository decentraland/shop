import { Rarity } from '@dcl/schemas'

// Real per-rarity color (common grey -> mythic pink, etc.) instead of one flat purple wash.
export function rarityColor(rarity?: string | null): string {
  if (!rarity) return '#a09ba8'
  try {
    return Rarity.getColor(rarity.toLowerCase() as Rarity)
  } catch {
    return '#a09ba8'
  }
}

// Pick black or white text for a solid background by perceived luminance (same threshold the reskin
// uses): light chip -> dark text, dark chip -> white text.
export function readableText(hex: string): string {
  const h = hex.replace('#', '')
  if (h.length < 6) return '#161518'
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b
  return luminance > 150 ? '#161518' : '#ffffff'
}
