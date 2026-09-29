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
import { EmptyState } from '~/components/EmptyState'
import { SuggestedForYouRow } from '~/components/SuggestedForYouRow'
import * as S from './MyFavorites.styles'
import emptyIllustration from '~/assets/empty/favorites-empty.svg'

// Signed-in favorites hydrate from the marketplace favorites service (hence the skeleton/error
// states); signed-out ones come straight from localStorage. Page the list so a long one doesn't
// render hundreds of cards at once.
const PAGE_SIZE = 24

// The rail asks about what is SAVED, so it must not offer the saved things back. The cap keeps the
// exclusion list — which travels in the query string — from growing with a long favourites list; past it
// the ownership filter on the server still covers anything already bought.
const SUGGESTED_EXCLUDE_CAP = 20

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

  const exclude = useMemo(
    () =>
      items
        .slice(0, SUGGESTED_EXCLUDE_CAP)
        .map(item =>
          item.contractAddress && item.itemId ? `${item.contractAddress.toLowerCase()}-${item.itemId}` : null
        )
        .filter((id): id is string => id !== null),
    [items]
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
      <S.Empty>
        <EmptyState
          testId="favorites-empty"
          icon={emptyIllustration}
          title={t('myFavorites.emptyTitle')}
          body={t('myFavorites.emptyBody')}
          cta={{ label: t('myFavorites.emptyCta'), to: '/items' }}
        />
        {/* An empty page with a button is the one place the rail costs nothing to show: there is no
            content for it to compete with, and someone with no favourites still has a cart, a history and
            a wallet to be read from. It hides itself when even that comes up empty. */}
        <S.Suggested>
          <SuggestedForYouRow title={t('myFavorites.suggestedTitle')} surface="favorites" />
        </S.Suggested>
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
      {/* Under the list rather than over it: what the reader came for is their own saved items, and the
          rail is what to do next. */}
      {!loading ? (
        <S.Suggested>
          <SuggestedForYouRow title={t('myFavorites.suggestedTitle')} surface="favorites" exclude={exclude} />
        </S.Suggested>
      ) : null}
    </section>
  )
}
