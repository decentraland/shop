// Category filter panel (Figma "Categories Dropdown", node 696:34701). Top categories with an
// accordion; Wearables expands into icon'd sub-categories. Wired to the Assets category/subCategory
// state. Sub-sub expansion (the deeper chevrons on Head/Accessories) is design-only for now — the
// shop feed has no sub-sub categories yet.

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
  { key: 'emote', label: 'Emotes', expandable: true },
  { key: 'ens', label: 'NAMEs', expandable: true },
  { key: 'parcel', label: 'Lands', expandable: true }
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
  return (
    <div className="catfilter">
      {CATEGORIES.map(top => {
        const expanded = top.key === category && !!top.subs
        const selected = top.key === category
        return (
          <div key={top.key} className="catfilter__group">
            <button
              type="button"
              className={`catfilter__cat${expanded ? ' is-expanded' : ''}${selected ? ' is-selected' : ''}`}
              onClick={() => onCategory(top.key)}
            >
              <span className="catfilter__cat-label">{top.label}</span>
              {top.expandable ? (
                <span className={`ico ico-chevron catfilter__chev${expanded ? ' is-up' : ''}`} aria-hidden />
              ) : null}
            </button>

            {expanded
              ? top.subs!.map(sub => (
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
                ))
              : null}
          </div>
        )
      })}
    </div>
  )
}
