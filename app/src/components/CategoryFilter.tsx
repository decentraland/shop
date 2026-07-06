import { useState } from 'react'

// Category filter panel (Figma "Categories Dropdown", node 696:34701). Top categories with an
// animated accordion; Wearables expands into icon'd sub-categories. Wired to the Assets category/
// subCategory state. Sub-sub expansion (the deeper chevrons on Head/Accessories) is design-only for
// now — the shop feed has no sub-sub categories yet.

type Sub = { key: string; label: string; icon: string; expandable?: boolean }
type Top = { key: string; label: string; expandable?: boolean; subs?: Sub[] }

const CATEGORIES: Top[] = [
  { key: 'all', label: 'Shop All' },
  {
    key: 'wearable',
    label: 'Wearables',
    expandable: true,
    subs: [
      { key: 'Head', label: 'Head', icon: 'cat-head', expandable: true },
      { key: 'Upper Body', label: 'Upper Body', icon: 'cat-upper' },
      { key: 'Handwear', label: 'Handwear', icon: 'cat-handwear' },
      { key: 'Lower Body', label: 'Lower Body', icon: 'cat-lower' },
      { key: 'Feet', label: 'Feet', icon: 'cat-feet' },
      { key: 'Accessories', label: 'Accessories', icon: 'cat-accessories', expandable: true },
      { key: 'Skins', label: 'Skins', icon: 'cat-skins' }
    ]
  },
  { key: 'emote', label: 'Emotes', expandable: true }
]

export function CategoryFilter({
  category,
  subCategory,
  onCategory,
  onSub
}: {
  category: string
  subCategory: string | null
  onCategory: (key: string) => void
  onSub: (key: string | null) => void
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
    <div className="catfilter">
      {CATEGORIES.map(top => {
        const open = expandedKey === top.key && !!top.subs
        const selected = top.key === category
        return (
          <div key={top.key} className="catfilter__group">
            <button
              type="button"
              className={`catfilter__cat${open ? ' is-expanded' : ''}${selected ? ' is-selected' : ''}`}
              onClick={() => clickTop(top)}
            >
              <span className="catfilter__cat-label">{top.label}</span>
              {top.expandable ? (
                <span className={`ico ico-chevron catfilter__chev${open ? ' is-up' : ''}`} aria-hidden />
              ) : null}
            </button>

            {top.subs ? (
              <div className={`catfilter__subs${open ? ' is-open' : ''}`}>
                <div className="catfilter__subs-inner">
                  {top.subs.map(sub => (
                    <button
                      key={sub.key}
                      type="button"
                      className={`catfilter__sub${subCategory === sub.key ? ' is-active' : ''}`}
                      onClick={() => onSub(subCategory === sub.key ? null : sub.key)}
                    >
                      <span className="catfilter__sub-left">
                        <span className={`ico ico-${sub.icon} catfilter__sub-ico`} aria-hidden />
                        <span className="catfilter__sub-label">{sub.label}</span>
                      </span>
                      {sub.expandable ? <span className="ico ico-chevron catfilter__chev catfilter__chev--sub" aria-hidden /> : null}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
