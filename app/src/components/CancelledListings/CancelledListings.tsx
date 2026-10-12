import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CurrencyIcon } from '~/components/CurrencyIcon'
import { Icon } from '~/components/Icon'
import { LoadMore } from '~/components/LoadMore'
import { Price } from '~/components/Price'
import { useManaRate } from '~/hooks/useManaRate'
import { useSecondarySales } from '~/hooks/useSecondarySales'
import { t } from '~/intl/i18n'
import { CANCELLED_TRADES_POST_MORTEM_URL, cancelledTradeCredits, type CancelledTrade } from '~/lib/cancelled-trades'
import { TradeAssetType } from '@dcl/schemas'
import { relistTargetFor } from './relistTarget'
import * as S from './CancelledListings.styles'

const LOADING_ROWS = 3

function Thumb({ src }: { src: string | null }) {
  const [broken, setBroken] = useState(false)
  return (
    <S.Thumb>{src && !broken ? <img src={src} alt="" loading="lazy" onError={() => setBroken(true)} /> : null}</S.Thumb>
  )
}

/** The listings and offers taken down by the marketplace upgrade, each with a way to put it back. */
export function CancelledListings({
  trades,
  total,
  hasNextPage = false,
  isFetchingNextPage = false,
  isFetchNextPageError = false,
  onLoadMore,
  autoLoad = true
}: {
  trades: CancelledTrade[]
  /** Across every page; the rows are only the pages loaded so far. */
  total?: number
  hasNextPage?: boolean
  isFetchingNextPage?: boolean
  isFetchNextPageError?: boolean
  onLoadMore?: () => void
  /** Off when more content sits below, so scrolling past the list does not keep growing it. */
  autoLoad?: boolean
}) {
  const secondarySales = useSecondarySales()
  const needsRate = trades.some(trade => trade.price?.assetType === Number(TradeAssetType.ERC20))
  const { data: rate } = useManaRate(needsRate)

  if (trades.length === 0) return null

  return (
    <S.Root data-testid="cancelled-listings" aria-labelledby="cancelled-listings-title">
      <S.Head>
        <S.TitleRow>
          <S.Title id="cancelled-listings-title">{t('cancelledListings.list.title')}</S.Title>
          <S.Count data-testid="cancelled-listings-count">
            {t('cancelledListings.list.count', { count: Math.max(total ?? 0, trades.length) })}
          </S.Count>
        </S.TitleRow>
        <S.Lede>
          {t('cancelledListings.list.lede')}{' '}
          <S.LearnMore
            href={CANCELLED_TRADES_POST_MORTEM_URL}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="cancelled-listings-learn-more"
          >
            {t('cancelledListings.learnMore')}
          </S.LearnMore>
        </S.Lede>
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
              <Thumb src={trade.asset.image} />
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
        {isFetchingNextPage
          ? Array.from({ length: LOADING_ROWS }, (_, i) => (
              <S.RowSkeleton key={i} data-testid="cancelled-listings-loading" aria-hidden />
            ))
          : null}
      </S.List>
      {onLoadMore ? (
        <LoadMore
          hasNextPage={hasNextPage}
          isFetching={isFetchingNextPage}
          isError={isFetchNextPageError}
          onLoadMore={onLoadMore}
          auto={autoLoad}
        />
      ) : null}
    </S.Root>
  )
}
