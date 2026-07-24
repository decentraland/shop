import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useFavorites } from '~/store/favorites'
import { AssetCard } from '~/components/AssetCard'
import { LoadMore } from '~/components/LoadMore'
import { useSeo } from '~/hooks/useSeo'
import { t } from '~/intl/i18n'
import emptyIllustration from '~/assets/error/favorites-empty.svg'

// Favorites live client-side (instant, no async → no skeleton needed); page them so a long list
// doesn't render hundreds of cards at once.
const PAGE_SIZE = 24

export function MyFavorites() {
  useSeo({ title: t('nav.myFavorites'), noindex: true })
  const items = useFavorites(s => Object.values(s.items))
  const [visible, setVisible] = useState(PAGE_SIZE)

  if (items.length === 0) {
    return (
      <div className="favorites-empty" data-testid="favorites-empty">
        <img className="favorites-empty__icon" src={emptyIllustration} alt="" width={138} height={138} />
        <div className="favorites-empty__text">
          <p className="favorites-empty__title">{t('myFavorites.emptyTitle')}</p>
          <p className="favorites-empty__body">{t('myFavorites.emptyBody')}</p>
        </div>
        <Link className="favorites-empty__cta" to="/assets">
          {t('myFavorites.emptyCta')}
        </Link>
      </div>
    )
  }

  return (
    <section className="favorites">
      <div className="favorites__head">
        <h1>{t('nav.myFavorites')}</h1>
        <span className="favorites__count">{t('myFavorites.itemCount', { count: items.length })}</span>
      </div>
      <div className="grid">
        {items.slice(0, visible).map(item => (
          <AssetCard key={item.id} item={item} />
        ))}
      </div>
      <LoadMore
        hasNextPage={visible < items.length}
        isFetching={false}
        onLoadMore={() => setVisible(v => v + PAGE_SIZE)}
      />
    </section>
  )
}
