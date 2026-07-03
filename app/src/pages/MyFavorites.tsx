import { Link } from 'react-router-dom'
import { useFavorites } from '~/store/favorites'
import { AssetCard } from '~/components/AssetCard'

export function MyFavorites() {
  const items = useFavorites(s => Object.values(s.items))

  if (items.length === 0) {
    return (
      <div className="favorites-empty">
        <span className="ico ico-heart favorites-empty__ico" aria-hidden />
        <p className="favorites-empty__title">No favorites yet</p>
        <p className="muted">Tap the heart on any item to save it here.</p>
        <Link className="btn btn--purple" to="/assets">Browse the shop</Link>
      </div>
    )
  }

  return (
    <section className="favorites">
      <div className="favorites__head">
        <h1>My Favorites</h1>
        <span className="favorites__count">{items.length} item{items.length > 1 ? 's' : ''}</span>
      </div>
      <div className="grid">
        {items.map(item => (
          <AssetCard key={item.id} item={item} />
        ))}
      </div>
    </section>
  )
}
