// Sidebar sub-labels → on-chain categories. Shared by every browse grid (Assets, Creator,
// Collection) so the same `wearableCategories` server filter param is derived identically. The
// server filters on a coalesced wearable/emote category column, so both wearable and emote sub-keys
// live in one map; keys match CategoryFilter's globally-unique `sub.key`s.
export const SUBCAT_MAP: Record<string, string[]> = {
  Head: ['head', 'hat', 'hair', 'facial_hair', 'eyes', 'eyebrows', 'mouth', 'mask', 'helmet', 'tiara', 'top_head'],
  'Upper Body': ['upper_body'],
  Handwear: ['hands_wear'],
  'Lower Body': ['lower_body'],
  Feet: ['feet'],
  Accessories: ['earring', 'eyewear'],
  Skins: ['skin'],
  Dance: ['dance'],
  Stunt: ['stunt'],
  Greetings: ['greetings'],
  Fun: ['fun'],
  Poses: ['poses'],
  Reactions: ['reactions'],
  Horror: ['horror'],
  Miscellaneous: ['miscellaneous']
}
