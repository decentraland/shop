import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '~/components/Icon'
import { useFavorites } from '~/store/favorites'
import { AssetCard } from '~/components/AssetCard'
import { LoadMore } from '~/components/LoadMore'
import { useSeo } from '~/hooks/useSeo'
import { t } from '~/intl/i18n'
import { Grid } from '~/styles/grid.styles'
import * as S from './MyFavorites.styles'

// Favorites live client-side (instant, no async → no skeleton needed); page them so a long list
// doesn't render hundreds of cards at once.
const PAGE_SIZE = 24

export function MyFavorites() {
  useSeo({ title: t('nav.myFavorites'), noindex: true })
  const items = useFavorites(s => Object.values(s.items))
  const [visible, setVisible] = useState(PAGE_SIZE)

  if (items.length === 0) {
    return (
      <S.Empty>
        <Icon name="heart" size={40} color="var(--muted-2)" />
        <S.EmptyTitle>{t('myFavorites.emptyTitle')}</S.EmptyTitle>
        <p className="muted">{t('myFavorites.emptyBody')}</p>
        <S.EmptyCta as={Link} to="/assets" variant="purple">
          {t('notFound.cta')}
        </S.EmptyCta>
      </S.Empty>
    )
  }

  return (
    <section>
      <S.Head>
        <h1>{t('nav.myFavorites')}</h1>
        <S.Count>{t('myFavorites.itemCount', { count: items.length })}</S.Count>
      </S.Head>
      <Grid>
        {items.slice(0, visible).map(item => (
          <AssetCard key={item.id} item={item} />
        ))}
      </Grid>
      <LoadMore
        hasNextPage={visible < items.length}
        isFetching={false}
        onLoadMore={() => setVisible(v => v + PAGE_SIZE)}
      />
    </section>
  )
}
