import type { CatalogItem } from '~/lib/api'

// On-chain wearable/emote category → sprite icon suffix (the `.ico-<suffix>` mask classes in index.css).
// Mirrors the sidebar CategoryFilter groups (see Assets' SUBCAT_MAP) so a card's category chip uses the
// same icon a shopper would filter by. Unknown categories fall back to null (chip is omitted).
const CATEGORY_ICON: Record<string, string> = {
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

/** Icon suffix for a card's category chip, or null when we have no matching icon. */
export function categoryIcon(item: Pick<CatalogItem, 'category' | 'wearableCategory'>): string | null {
  const key = item.wearableCategory?.toLowerCase()
  if (key && CATEGORY_ICON[key]) return CATEGORY_ICON[key]
  // Emote with an unmapped/missing sub-category still gets the generic emote glyph.
  if (item.category === 'emote') return 'emote-misc'
  return null
}

/** Icon suffix for the gender chip, or null when gender is unknown. */
export function genderIcon(gender: CatalogItem['gender']): string | null {
  if (gender === 'male') return 'gender-male'
  if (gender === 'female') return 'gender-female'
  if (gender === 'unisex') return 'gender-unisex'
  return null
}
