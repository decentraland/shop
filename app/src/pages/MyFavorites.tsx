import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '~/components/Icon'
import { useFavorites } from '~/store/favorites'
import { AssetCard } from '~/components/AssetCard'
import { LoadMore } from '~/components/LoadMore'
import { Button } from '~/components/Button'
import styled from '@emotion/styled'

const EmptyCta = styled(Button)`
  margin-top: 12px;
`

// Favorites live client-side (instant, no async → no skeleton needed); page them so a long list
// doesn't render hundreds of cards at once.
const PAGE_SIZE = 24

export function MyFavorites() {
  const items = useFavorites(s => Object.values(s.items))
  const [visible, setVisible] = useState(PAGE_SIZE)

  if (items.length === 0) {
    return (
      <div className="favorites-empty">
        <Icon name="heart" size={40} color="var(--muted-2)" />
        <p className="favorites-empty__title">No favorites yet</p>
        <p className="muted">Tap the heart on any item to save it here.</p>
        <EmptyCta as={Link} to="/assets" variant="purple">
          Browse Collectibles
        </EmptyCta>
      </div>
    )
  }

  return (
    <section className="favorites">
      <div className="favorites__head">
        <h1>My Favorites</h1>
        <span className="favorites__count">
          {items.length} item{items.length > 1 ? 's' : ''}
        </span>
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
