import { useMemo } from 'react'
import { getRecentlyViewed } from '~/lib/recently-viewed'
import { AssetCard } from '~/components/AssetCard'
import { t } from '~/intl/i18n'

// "Recently viewed" discovery row (client-side, from localStorage). Renders nothing until the user
// has viewed at least one item. `excludeId` drops the item currently on screen (e.g. on its detail page).
export function RecentlyViewed({ excludeId }: { excludeId?: string }) {
  const items = useMemo(() => getRecentlyViewed().filter(i => i.id !== excludeId), [excludeId])
  if (items.length === 0) return null
  return (
    <section className="row">
      <div className="row__head">
        <h2 className="row__title">{t('recentlyViewed.title')}</h2>
      </div>
      <div className="row__track">
        {items.map(item => (
          <AssetCard key={item.id} item={item} />
        ))}
      </div>
    </section>
  )
}

export default RecentlyViewed
