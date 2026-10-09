import { SparklesIcon } from 'decentraland-ui2/dist/components/Icon'
import { NotificationItemText } from 'decentraland-ui2/dist/components/Notifications/NotificationItem'
import { getBGColorByRarity } from 'decentraland-ui2/dist/components/Notifications/utils'
import { Rarity } from '@dcl/schemas'
import type { MouseEvent } from 'react'
import { t } from '~/intl/i18n'
import { track } from '~/lib/analytics'
import { CURRENCY, formatCreditsFull } from '~/lib/currency'
import type { ShopNotification } from '~/lib/notifications'

type ItemDiscountedMetadata = {
  image: string
  rarity?: string
  nftName?: string
  contractAddress: string
  itemId: string
  link: string
  discountPct: number
  listPrice: string
  salePrice: string
}

const RARITIES = new Set<string>(Rarity.getRarities())

function wholeCredits(value: unknown): number | null {
  const n = Number(value)
  return typeof value === 'string' && Number.isInteger(n) && n >= 0 ? n : null
}

/** The `item_discounted` row: a favorited item went on sale. ui2 has no renderer for this type yet. */
export function ItemDiscountedNotification({
  notification,
  locale
}: {
  notification: ShopNotification
  locale: 'en' | 'es'
  renderProfile: (address: string) => string
}) {
  const meta = (notification.metadata ?? {}) as Partial<ItemDiscountedMetadata>
  const sale = wholeCredits(meta.salePrice)
  const list = wholeCredits(meta.listPrice)
  const pct = meta.discountPct
  // Server data: a row that would read "NaN" or link somewhere unexpected is dropped rather than shown.
  if (
    sale === null ||
    list === null ||
    typeof pct !== 'number' ||
    !Number.isInteger(pct) ||
    pct < 1 ||
    pct > 100 ||
    typeof meta.link !== 'string' ||
    !meta.link.startsWith('https://') ||
    typeof meta.image !== 'string'
  ) {
    return null
  }

  const name = meta.nftName || t('itemDiscountedNotification.itemFallback')
  const onClick = (e: MouseEvent) => {
    if (!(e.target instanceof Element) || !e.target.closest('a')) return
    track('Shop Clicked Favorite Discount Notification', {
      contract_address: meta.contractAddress ?? null,
      item_id: meta.itemId ?? null,
      discount_pct: pct
    })
  }

  return (
    <div onClickCapture={onClick} data-testid="item-discounted-notification">
      <NotificationItemText
        image={meta.image}
        imageBackgroundColor={
          meta.rarity && RARITIES.has(meta.rarity) ? getBGColorByRarity(meta.rarity as Rarity) : undefined
        }
        badgeIcon={<SparklesIcon />}
        locale={locale}
        notification={notification}
        title={t('itemDiscountedNotification.title')}
        descriptionHref={meta.link}
        description={t('itemDiscountedNotification.description', {
          name,
          pct,
          sale: formatCreditsFull(sale),
          list: formatCreditsFull(list),
          currency: CURRENCY.name
        })}
      />
    </div>
  )
}

export default ItemDiscountedNotification
