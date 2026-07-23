import { useState } from 'react'
import { t } from '~/intl/i18n'
import { type IconName } from '~/components/Icon'
import { Chevron } from '~/components/Chevron'
import * as S from './CategoryFilter.styles'

// Category filter panel (Figma "Categories Dropdown", node 696:34701). Top categories with an
// animated accordion; Wearables and Emotes each expand into icon'd sub-categories. Wired to the
// Assets category/subCategory state. Only categories with real sub-content carry a chevron; sub keys
// are globally unique so they map cleanly to Assets' SUBCAT_MAP (which resolves both wearable and
// emote on-chain categories — the server filters on a coalesced wearable/emote category column).

// `key` drives filter state + SUBCAT_MAP lookups (Assets/Creator) and must NOT change; `labelKey`
// is the i18n key resolved with t() at render (never at module load — that would freeze the locale).
type Sub = { key: string; labelKey: string; icon: IconName }
type Top = { key: string; labelKey: string; expandable?: boolean; subs?: Sub[] }

export const CATEGORIES: Top[] = [
  { key: 'all', labelKey: 'categories.shopAll' },
  {
    key: 'wearable',
    labelKey: 'categories.wearables',
    expandable: true,
    subs: [
      { key: 'Head', labelKey: 'categories.head', icon: 'cat-head' },
      { key: 'Upper Body', labelKey: 'categories.upperBody', icon: 'cat-upper' },
      { key: 'Handwear', labelKey: 'categories.handwear', icon: 'cat-handwear' },
      { key: 'Lower Body', labelKey: 'categories.lowerBody', icon: 'cat-lower' },
      { key: 'Feet', labelKey: 'categories.feet', icon: 'cat-feet' },
      { key: 'Accessories', labelKey: 'categories.accessories', icon: 'cat-accessories' },
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
  extraLabelKey?: string
}) {
  // Accordion state is separate from the active category so clicking an open header collapses it
  // (the old derive-from-category approach couldn't close). Wearables starts open when it's active.
  const [expandedKey, setExpandedKey] = useState<string | null>(() => (category === 'wearable' ? 'wearable' : null))

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
    <S.Root>
      {title ? <S.Title>{title}</S.Title> : null}
      {CATEGORIES.filter(top => !(hideAll && top.key === 'all')).map(top => {
        const open = expandedKey === top.key && !!top.subs
        // In collections mode nothing in the normal category list is highlighted.
        const selected = !collections && top.key === category
        return (
          <S.Group key={top.key}>
            <S.CatButton
              type="button"
              flat={flat}
              className={`${open ? ' is-expanded' : ''}${selected ? ' is-selected' : ''}`}
              onClick={() => clickTop(top)}
            >
              <S.CatLabel>{t(top.labelKey)}</S.CatLabel>
              {top.expandable ? <Chevron up={open} size={24} color="var(--text)" /> : null}
            </S.CatButton>

            {top.subs ? (
              <S.Subs className={open ? 'is-open' : ''}>
                <S.SubsInner>
                  {top.subs.map(sub => {
                    const active = subCategory === sub.key
                    return (
                      <S.SubButton
                        key={sub.key}
                        type="button"
                        flat={flat}
                        className={active ? 'is-active' : ''}
                        onClick={() => onSub(active ? null : sub.key)}
                      >
                        <S.SubLeft>
                          <S.SubIcon name={sub.icon} aria-hidden />
                          <S.SubLabel active={active}>{t(sub.labelKey)}</S.SubLabel>
                        </S.SubLeft>
                      </S.SubButton>
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
          <S.CatButton type="button" flat={flat} className={collections ? 'is-selected' : ''} onClick={onCollections}>
            <S.CatLabel>{t(extraLabelKey)}</S.CatLabel>
          </S.CatButton>
        </S.Group>
      ) : null}
    </S.Root>
  )
}
