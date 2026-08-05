import { useMemo, useState } from 'react'
import { useFavorites } from '~/store/favorites'
import { AssetCard } from '~/components/AssetCard'
import { LoadMore } from '~/components/LoadMore'
import { ErrorNotice } from '~/components/ErrorNotice'
import { SkeletonCards } from '~/components/SkeletonCards'
import { useManaRate } from '~/hooks/useManaRate'
import { displayCredits } from '~/lib/mana-convert'
import { useSeo } from '~/hooks/useSeo'
import { t } from '~/intl/i18n'
import { Grid } from '~/styles/grid.styles'
import * as S from './MyFavorites.styles'
import emptyIllustration from '~/assets/error/favorites-empty.svg'

// Signed-in favorites hydrate from the marketplace favorites service (hence the skeleton/error
// states); signed-out ones come straight from localStorage. Page the list so a long one doesn't
// render hundreds of cards at once.
const PAGE_SIZE = 24

export function MyFavorites() {
  useSeo({ title: t('nav.myFavorites'), noindex: true })
  const stored = useFavorites(s => Object.values(s.items))
  const status = useFavorites(s => s.status)
  const retry = useFavorites(s => s.retry)
  const [visible, setVisible] = useState(PAGE_SIZE)

  // Favorites hydrate from the /v2 catalog, which prices in MANA, so the cards get their credit price
  // at the live rate — the same rule the browse grid applies to any MANA-priced card.
  const { data: rate, isPending: ratePending, isError: rateError } = useManaRate()
  const hasManaItems = stored.some(item => !!item.manaWei)
  const items = useMemo(
    () => stored.map(item => ({ ...item, priceCredits: displayCredits(item, rate) })),
    [stored, rate]
  )

  if (status === 'error') {
    return (
      <S.ErrorWrap data-testid="favorites-error">
        <ErrorNotice message={t('myFavorites.loadError')} />
        <S.Retry type="button" onClick={retry}>
          {t('myFavorites.tryAgain')}
        </S.Retry>
      </S.ErrorWrap>
    )
  }

  if (status === 'ready' && items.length === 0) {
    return (
      <S.Empty data-testid="favorites-empty">
        <S.EmptyIcon src={emptyIllustration} alt="" width={138} height={138} />
        <S.EmptyText>
          <S.EmptyTitle>{t('myFavorites.emptyTitle')}</S.EmptyTitle>
          <S.EmptyBody>{t('myFavorites.emptyBody')}</S.EmptyBody>
        </S.EmptyText>
        <S.EmptyCta to="/items">{t('myFavorites.emptyCta')}</S.EmptyCta>
      </S.Empty>
    )
  }

  const loading = status === 'loading' || (ratePending && hasManaItems)
  return (
    <section>
      <S.Head>
        <S.Title>{t('nav.myFavorites')}</S.Title>
        {!loading ? <S.Count>{t('myFavorites.itemCount', { count: items.length })}</S.Count> : null}
      </S.Head>
      {rateError && hasManaItems ? <S.RateBanner>{t('assets.marketUnavailable')}</S.RateBanner> : null}
      <Grid data-testid={loading ? 'favorites-loading' : undefined}>
        {loading ? (
          <SkeletonCards count={8} />
        ) : (
          items.slice(0, visible).map(item => <AssetCard key={item.id} item={item} />)
        )}
      </Grid>
      <LoadMore
        hasNextPage={!loading && visible < items.length}
        isFetching={false}
        onLoadMore={() => setVisible(v => v + PAGE_SIZE)}
      />
    </section>
  )
}
