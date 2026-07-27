import { Tooltip } from '~/components/Tooltip'
import { Icon } from '~/components/Icon'
import { track } from '~/lib/analytics'
import { t } from '~/intl/i18n'
import type { CatalogItem } from '~/lib/api'
import * as S from './MakeOfferButton.styles'

// "Make an offer" on a not-for-sale item. Bids aren't shipped yet (a future contracts epic), so the
// button is present but disabled with a "coming soon" tooltip. We emit a Segment event the first time a
// viewer hovers/focuses the tooltip to gauge demand for the feature.
// TODO(analytics): build a dashboard on the 'Shop Make Offer Tooltip Shown' event to size interest in bids.
export function MakeOfferButton({ item }: { item: CatalogItem }) {
  return (
    <Tooltip
      block
      content={t('makeOffer.comingSoon')}
      onShow={() =>
        track('Shop Make Offer Tooltip Shown', {
          contractAddress: item.contractAddress,
          itemId: item.itemId
        })
      }
    >
      <S.Button type="button" aria-disabled onClick={e => e.preventDefault()} data-testid="make-offer">
        <Icon name="offer" size={20} aria-hidden />
        <span>{t('makeOffer.cta')}</span>
      </S.Button>
    </Tooltip>
  )
}
