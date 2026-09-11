import { useMemo } from 'react'
import { getRecentlyViewed } from '~/lib/recently-viewed'
import { useLivePricedItems } from '~/hooks/useLivePricedItems'
import { AssetCard } from '~/components/AssetCard'
import { t } from '~/intl/i18n'
import * as Row from '~/styles/row.styles'

// "Recently viewed" discovery row (client-side, from localStorage). Renders nothing until the user
// has viewed at least one item. `excludeId` drops the item currently on screen (e.g. on its detail page).
export function RecentlyViewed({ excludeId }: { excludeId?: string }) {
  const stored = useMemo(() => getRecentlyViewed().filter(i => i.id !== excludeId), [excludeId])
  // Snapshots taken whenever the item was viewed, so a MANA row's stored credit price is as old as the
  // visit — re-price it rather than showing what the rate was then.
  const items = useLivePricedItems(stored)
  if (items.length === 0) return null
  return (
    <Row.Root>
      <Row.Head>
        <Row.Title>{t('recentlyViewed.title')}</Row.Title>
      </Row.Head>
      <Row.Track data-rail>
        {items.map(item => (
          <AssetCard key={item.id} item={item} />
        ))}
      </Row.Track>
    </Row.Root>
  )
}

export default RecentlyViewed
