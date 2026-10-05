import { Link } from 'react-router-dom'
import { CurrencyIcon } from '~/components/CurrencyIcon'
import { Icon } from '~/components/Icon'
import { Price } from '~/components/Price'
import { useManaRate } from '~/hooks/useManaRate'
import { useSecondarySales } from '~/hooks/useSecondarySales'
import { t } from '~/intl/i18n'
import { cancelledTradeCredits, type CancelledTrade } from '~/lib/cancelled-trades'
import { TradeAssetType } from '@dcl/schemas'
import { relistTargetFor } from './relistTarget'
import * as S from './CancelledListings.styles'

/** The listings and offers taken down by the marketplace upgrade, each with a way to put it back. */
export function CancelledListings({ trades }: { trades: CancelledTrade[] }) {
  const secondarySales = useSecondarySales()
  const needsRate = trades.some(trade => trade.price?.assetType === Number(TradeAssetType.ERC20))
  const { data: rate } = useManaRate(needsRate)

  if (trades.length === 0) return null

  return (
    <S.Root data-testid="cancelled-listings" aria-labelledby="cancelled-listings-title">
      <S.Head>
        <S.Title id="cancelled-listings-title">{t('cancelledListings.list.title')}</S.Title>
        <S.Lede>{t('cancelledListings.list.lede')}</S.Lede>
      </S.Head>
      <S.List>
        {trades.map(trade => {
          const credits = cancelledTradeCredits(trade, rate)
          const target = relistTargetFor(trade, { secondarySales })
          const isBid = trade.type === 'bid'
          const name = trade.asset.name || t('cancelledListings.list.itemFallback')
          const label = t(isBid ? 'cancelledListings.list.reoffer' : 'cancelledListings.list.relist')
          return (
            <S.Row key={trade.id} data-testid="cancelled-listings-row" data-kind={trade.type}>
              <S.Thumb>{trade.asset.image ? <img src={trade.asset.image} alt="" /> : null}</S.Thumb>
              <S.Info>
                <S.Name title={name}>{name}</S.Name>
                <S.Chip data-kind={isBid ? 'bid' : 'listing'}>
                  {t(isBid ? 'cancelledListings.list.kindOffer' : 'cancelledListings.list.kindListing')}
                </S.Chip>
              </S.Info>
              {credits !== null ? (
                <S.Price data-testid="cancelled-listings-price">
                  <S.PriceLabel>{t('cancelledListings.list.price')}</S.PriceLabel>
                  <S.PriceValue>
                    <CurrencyIcon />
                    <Price credits={credits} />
                  </S.PriceValue>
                </S.Price>
              ) : null}
              {target?.kind === 'shop' ? (
                <S.Action as={Link} to={target.to} variant="red" size="sm" data-testid="cancelled-listings-action">
                  {label}
                </S.Action>
              ) : target?.kind === 'marketplace' ? (
                <S.Action
                  as="a"
                  href={target.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  variant="outline"
                  size="sm"
                  data-testid="cancelled-listings-action"
                  data-target="marketplace"
                  aria-label={t('cancelledListings.list.elsewhereAria', { action: label, name })}
                >
                  {label}
                  <Icon name="external-link" aria-hidden />
                </S.Action>
              ) : null}
            </S.Row>
          )
        })}
      </S.List>
    </S.Root>
  )
}
