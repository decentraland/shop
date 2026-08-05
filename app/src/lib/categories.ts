// Sidebar sub-labels → on-chain categories. Shared by every browse grid (Assets, Creator,
// Collection) so the same `wearableCategories` server filter param is derived identically. The
// server filters on a coalesced wearable/emote category column, so both wearable and emote sub-keys
// live in one map; keys match CategoryFilter's globally-unique `sub.key`s.
export const SUBCAT_MAP: Record<string, string[]> = {
  // Head and Accessories each expand into the categories below them (CategoryFilter's third level), and
  // the parent is the union of its children so picking it still means "everything on the head".
  //
  // The worn-on-the-head ACCESSORIES — hat, helmet, mask, tiara, top_head — used to sit under Head here,
  // which put them in a different section from where the marketplace and the design (Figma 2212:99919)
  // both place them. They now group under Accessories, so the two storefronts answer the same question
  // the same way. This changes what each section returns, not just how the sidebar looks.
  Head: ['head', 'hair', 'facial_hair', 'eyes', 'eyebrows', 'mouth'],
  'Facial Hair': ['facial_hair'],
  Hair: ['hair'],
  Eyes: ['eyes'],
  Eyebrows: ['eyebrows'],
  Mouth: ['mouth'],
  'Upper Body': ['upper_body'],
  Handwear: ['hands_wear'],
  'Lower Body': ['lower_body'],
  Feet: ['feet'],
  Accessories: ['earring', 'eyewear', 'hat', 'helmet', 'mask', 'tiara', 'top_head'],
  Earring: ['earring'],
  Eyewear: ['eyewear'],
  Hat: ['hat'],
  Helmet: ['helmet'],
  Mask: ['mask'],
  Tiara: ['tiara'],
  'Top Head': ['top_head'],
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
