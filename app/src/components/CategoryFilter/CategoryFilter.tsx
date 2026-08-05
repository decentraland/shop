import { useState } from 'react'
import { t } from '~/intl/i18n'
import { type IconName } from '~/components/Icon'
import { Chevron } from '~/components/Chevron'
import * as S from './CategoryFilter.styles'
import { theme } from '~/styles/theme'

// Category filter panel (Figma "Categories Dropdown", node 696:34701). Top categories with an
// animated accordion; Wearables and Emotes each expand into icon'd sub-categories. Wired to the
// Assets category/subCategory state. Only categories with real sub-content carry a chevron; sub keys
// are globally unique so they map cleanly to Assets' SUBCAT_MAP (which resolves both wearable and
// emote on-chain categories — the server filters on a coalesced wearable/emote category column).

// `key` drives filter state + SUBCAT_MAP lookups (Assets/Creator) and must NOT change; `labelKey`
// is the i18n key resolved with t() at render (never at module load — that would freeze the locale).
// Head and Accessories nest one level deeper (Figma 2212:99919): they are selectable rows in their own
// right AND expand into the on-chain categories beneath them. A third level needs no new filter state —
// sub keys are globally unique, so a level-three key resolves through the same SUBCAT_MAP lookup and the
// same `subCategory` value as a level-two one.
type SubSub = { key: string; labelKey: string; icon: IconName }
type Sub = { key: string; labelKey: string; icon: IconName; expandable?: boolean; subs?: SubSub[] }
type Top = { key: string; labelKey: string; expandable?: boolean; subs?: Sub[] }

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

export function CategoryFilter({
  category,
  subCategory,
  onCategory,
  onSub,
  title,
  flat = false,
  collections = false,
  onCollections,
  hideAll = false,
  hideNames = false,
  extraLabelKey = 'categories.collections'
}: {
  category: string
  subCategory: string | null
  onCategory: (key: string) => void
  onSub: (key: string | null) => void
  // Optional section heading rendered above the list (e.g. "Category" on the creator page).
  title?: string
  // Flat = drop the gray container/background; selected & hover read as a light-gray pill instead.
  flat?: boolean
  // Creator page only: render a "Collections" entry at the end. `collections` reflects whether it's
  // the active mode (mutually exclusive with the category selection); `onCollections` toggles it.
  collections?: boolean
  onCollections?: () => void
  // My Assets: hide the "Shop All" entry (owned sections only) and relabel the onCollections entry
  // (e.g. "My Creations") so the same category nav can be reused across pages.
  hideAll?: boolean
  // Creator page: NAMEs are registered by whoever buys them, not published by a creator, so a
  // creator-scoped NAMEs entry has nothing to filter and would just re-show their wearables/emotes.
  hideNames?: boolean
  extraLabelKey?: string
}) {
  // Accordion state is separate from the active category so clicking an open header collapses it
  // (the old derive-from-category approach couldn't close). Wearables starts open when it's active.
  const [expandedKey, setExpandedKey] = useState<string | null>(() => (category === 'wearable' ? 'wearable' : null))
  // Second accordion, for the level-two rows that nest (Head, Accessories). Kept separate from
  // `expandedKey` rather than folded into one value: the two levels are open at the same time, since a
  // level-three row can only be reached through its already-open parent.
  const [expandedSubKey, setExpandedSubKey] = useState<string | null>(null)

  // Clicking a nesting row both selects it and toggles its children — same bargain `clickTop` strikes,
  // so Head stays a usable filter on its own instead of becoming a folder you cannot pick.
  function clickSub(sub: Sub) {
    onSub(subCategory === sub.key ? null : sub.key)
    if (sub.subs) setExpandedSubKey(prev => (prev === sub.key ? null : sub.key))
  }

  function clickTop(top: Top) {
    if (top.subs) {
      setExpandedKey(prev => {
        const willOpen = prev !== top.key
        if (willOpen) onCategory(top.key) // select the category when opening; collapsing keeps the filter
        return willOpen ? top.key : null
      })
    } else {
      onCategory(top.key)
      setExpandedKey(null)
    }
  }

  return (
    <S.Root data-flat={flat || undefined}>
      {title ? <S.Title>{title}</S.Title> : null}
      {CATEGORIES.filter(top => !(hideAll && top.key === 'all') && !(hideNames && top.key === 'names')).map(top => {
        const open = expandedKey === top.key && !!top.subs
        // In collections mode nothing in the normal category list is highlighted.
        const selected = !collections && top.key === category
        return (
          <S.Group key={top.key}>
            <S.Cat
              type="button"
              data-cat
              data-expanded={open || undefined}
              data-selected={selected || undefined}
              onClick={() => clickTop(top)}
            >
              <S.CatLabel>{t(top.labelKey)}</S.CatLabel>
              {top.expandable ? <Chevron up={open} size={24} color={theme.colors.text} /> : null}
            </S.Cat>

            {top.subs ? (
              <S.Subs data-open={open || undefined}>
                <S.SubsInner>
                  {top.subs.map(sub => {
                    const subOpen = expandedSubKey === sub.key && !!sub.subs
                    return (
                      <div key={sub.key}>
                        <S.Sub
                          type="button"
                          data-sub
                          data-active={subCategory === sub.key || undefined}
                          onClick={() => clickSub(sub)}
                        >
                          <S.SubLeft>
                            <S.SubIcon name={sub.icon} aria-hidden />
                            <S.SubLabel data-sub-label>{t(sub.labelKey)}</S.SubLabel>
                          </S.SubLeft>
                          {sub.expandable ? <Chevron up={subOpen} size={24} color={theme.colors.text} /> : null}
                        </S.Sub>

                        {sub.subs ? (
                          <S.Subs data-open={subOpen || undefined}>
                            <S.SubsInner>
                              {sub.subs.map(leaf => (
                                <S.SubSub
                                  key={leaf.key}
                                  type="button"
                                  data-sub
                                  data-active={subCategory === leaf.key || undefined}
                                  onClick={() => onSub(subCategory === leaf.key ? null : leaf.key)}
                                >
                                  <S.SubLeft>
                                    <S.SubIcon name={leaf.icon} aria-hidden />
                                    <S.SubLabel data-sub-label>{t(leaf.labelKey)}</S.SubLabel>
                                  </S.SubLeft>
                                </S.SubSub>
                              ))}
                            </S.SubsInner>
                          </S.Subs>
                        ) : null}
                      </div>
                    )
                  })}
                </S.SubsInner>
              </S.Subs>
            ) : null}
          </S.Group>
        )
      })}

      {onCollections ? (
        <S.Group>
          <S.Cat type="button" data-cat data-selected={collections || undefined} onClick={onCollections}>
            <S.CatLabel>{t(extraLabelKey)}</S.CatLabel>
          </S.Cat>
        </S.Group>
      ) : null}
    </S.Root>
  )
}
