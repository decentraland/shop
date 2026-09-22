import type { IconName } from '~/components/Icon'

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

// `key` drives filter state + SUBCAT_MAP lookups (Assets/Creator) and must NOT change; `labelKey`
// is the i18n key resolved with t() at render (never at module load — that would freeze the locale).
// Head and Accessories nest one level deeper (Figma 2212:99919): they are selectable rows in their own
// right AND expand into the on-chain categories beneath them. A third level needs no new filter state —
// sub keys are globally unique, so a level-three key resolves through the same SUBCAT_MAP lookup and the
// same `subCategory` value as a level-two one.
export type SubSub = { key: string; labelKey: string; icon: IconName }
export type Sub = { key: string; labelKey: string; icon: IconName; expandable?: boolean; subs?: SubSub[] }
export type Top = { key: string; labelKey: string; expandable?: boolean; subs?: Sub[] }

export const CATEGORIES: Top[] = [
  { key: 'all', labelKey: 'categories.shopAll' },
  {
    key: 'wearable',
    labelKey: 'categories.wearables',
    expandable: true,
    subs: [
      {
        key: 'Head',
        labelKey: 'categories.head',
        icon: 'cat-head',
        expandable: true,
        subs: [
          { key: 'Facial Hair', labelKey: 'categories.facialHair', icon: 'cat-facial-hair' },
          { key: 'Hair', labelKey: 'categories.hair', icon: 'cat-hair' },
          { key: 'Eyes', labelKey: 'categories.eyes', icon: 'cat-eyes' },
          { key: 'Eyebrows', labelKey: 'categories.eyebrows', icon: 'cat-eyebrows' },
          { key: 'Mouth', labelKey: 'categories.mouth', icon: 'cat-mouth' }
        ]
      },
      { key: 'Upper Body', labelKey: 'categories.upperBody', icon: 'cat-upper' },
      { key: 'Handwear', labelKey: 'categories.handwear', icon: 'cat-handwear' },
      { key: 'Lower Body', labelKey: 'categories.lowerBody', icon: 'cat-lower' },
      { key: 'Feet', labelKey: 'categories.feet', icon: 'cat-feet' },
      {
        key: 'Accessories',
        labelKey: 'categories.accessories',
        icon: 'cat-accessories',
        expandable: true,
        subs: [
          { key: 'Earring', labelKey: 'categories.earring', icon: 'cat-earring' },
          { key: 'Eyewear', labelKey: 'categories.eyewear', icon: 'cat-eyewear' },
          { key: 'Hat', labelKey: 'categories.hat', icon: 'cat-hat' },
          { key: 'Helmet', labelKey: 'categories.helmet', icon: 'cat-helmet' },
          { key: 'Mask', labelKey: 'categories.mask', icon: 'cat-mask' },
          { key: 'Tiara', labelKey: 'categories.tiara', icon: 'cat-tiara' },
          { key: 'Top Head', labelKey: 'categories.topHead', icon: 'cat-top-head' }
        ]
      },
      { key: 'Skins', labelKey: 'categories.skins', icon: 'cat-skins' }
    ]
  },
  {
    key: 'emote',
    labelKey: 'categories.emotes',
    expandable: true,
    subs: [
      { key: 'Dance', labelKey: 'categories.dance', icon: 'emote-dance' },
      { key: 'Stunt', labelKey: 'categories.stunt', icon: 'emote-stunt' },
      { key: 'Greetings', labelKey: 'categories.greetings', icon: 'emote-greetings' },
      { key: 'Fun', labelKey: 'categories.fun', icon: 'emote-fun' },
      { key: 'Poses', labelKey: 'categories.poses', icon: 'emote-poses' },
      { key: 'Reactions', labelKey: 'categories.reactions', icon: 'emote-reactions' },
      { key: 'Horror', labelKey: 'categories.horror', icon: 'emote-horror' },
      { key: 'Miscellaneous', labelKey: 'categories.miscellaneous', icon: 'emote-misc' }
    ]
  },
  // NAMEs is a distinct destination (not a collectibles filter): selecting it swaps the grid for the
  // NAMEs purchase page (see Assets.tsx). No sub-categories.
  { key: 'names', labelKey: 'categories.names' }
]
