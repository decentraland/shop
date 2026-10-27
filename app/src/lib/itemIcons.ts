import { t } from '~/intl/i18n'
import type { CatalogItem } from '~/lib/api'
import type { IconName } from '~/components/Icon'

// On-chain wearable/emote category → icon name. Mirrors the sidebar CategoryFilter groups so a card's
// category chip uses the same icon a shopper would filter by. Unknown categories fall back to null.
const CATEGORY_ICON: Record<string, IconName> = {
  // Head group
  head: 'cat-head',
  hat: 'cat-head',
  hair: 'cat-head',
  facial_hair: 'cat-head',
  eyes: 'cat-head',
  eyebrows: 'cat-head',
  mouth: 'cat-head',
  mask: 'cat-head',
  helmet: 'cat-head',
  tiara: 'cat-head',
  top_head: 'cat-head',
  // Body
  upper_body: 'cat-upper',
  hands_wear: 'cat-handwear',
  lower_body: 'cat-lower',
  feet: 'cat-feet',
  // Accessories
  earring: 'cat-accessories',
  eyewear: 'cat-accessories',
  // Skins
  skin: 'cat-skins',
  // Emotes
  dance: 'emote-dance',
  stunt: 'emote-stunt',
  greetings: 'emote-greetings',
  fun: 'emote-fun',
  poses: 'emote-poses',
  reactions: 'emote-reactions',
  horror: 'emote-horror'
}

/** Icon for a card's category chip, or null when we have no matching icon. */
export function categoryIcon(item: Pick<CatalogItem, 'category' | 'wearableCategory'>): IconName | null {
  const key = item.wearableCategory?.toLowerCase()
  if (key && CATEGORY_ICON[key]) return CATEGORY_ICON[key]
  // Emote with an unmapped/missing sub-category still gets the generic emote glyph.
  if (item.category === 'emote') return 'emote-misc'
  return null
}

// The slot's own glyph where the set has one; the group glyph (categoryIcon) otherwise.
const SLOT_ICON: Record<string, IconName> = {
  eyebrows: 'cat-eyebrows',
  eyes: 'cat-eyes',
  eyewear: 'cat-eyewear',
  earring: 'cat-earring',
  facial_hair: 'cat-facial-hair',
  hair: 'cat-hair',
  hat: 'cat-hat',
  helmet: 'cat-helmet',
  mask: 'cat-mask',
  mouth: 'cat-mouth',
  tiara: 'cat-tiara',
  top_head: 'cat-top-head'
}

/** Icon for one wearable slot, e.g. in the list of what an item hides; null when we have none. */
export function wearableSlotIcon(slot: string): IconName | null {
  const key = slot.toLowerCase()
  return SLOT_ICON[key] ?? categoryIcon({ category: 'wearable', wearableCategory: key })
}

// Slots whose catalogue name key is not the slot itself.
const SLOT_LABEL_KEY: Record<string, string> = {
  upper_body: 'upperBody',
  lower_body: 'lowerBody',
  hands_wear: 'handwear',
  facial_hair: 'facialHair',
  top_head: 'topHead',
  skin: 'skins'
}
const NAMED_SLOTS = new Set([
  'head',
  'feet',
  'hair',
  'eyes',
  'eyebrows',
  'mouth',
  'earring',
  'eyewear',
  'hat',
  'helmet',
  'mask',
  'tiara'
])

/** The translated name of a wearable slot (`upper_body` → "Upper Body"), or the slot spaced out when it has none. */
export function wearableSlotLabel(slot: string): string {
  const key = SLOT_LABEL_KEY[slot] ?? (NAMED_SLOTS.has(slot) ? slot : null)
  return key ? t(`categories.${key}`) : slot.replace(/_/g, ' ')
}

/** Gender icon only for items limited to one body shape; null for unisex or unknown. */
export function singleShapeIcon(item: Pick<CatalogItem, 'gender'>): IconName | null {
  return item.gender === 'male' || item.gender === 'female' ? genderIcon(item.gender) : null
}

/** Icon for the gender chip, or null when gender is unknown. */
export function genderIcon(gender: CatalogItem['gender']): IconName | null {
  if (gender === 'male') return 'gender-male'
  if (gender === 'female') return 'gender-female'
  if (gender === 'unisex') return 'gender-unisex'
  return null
}
