import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { fetchCreatorItems } from '~/lib/collections'
import { AssetCard } from '~/components/AssetCard'
import { CreatorBadge } from '~/components/CreatorBadge'
import { FollowButton } from '~/components/FollowButton'
import { AddAllToCart } from '~/components/AddAllToCart'
import './collection.css'

// A creator's storefront: every item they made, in a grid. Discovery that feeds the North Star
// (help buyers find + buy more from a creator). Uses /v1/items?creator= — no backend change.
export function Creator() {
  const { address } = useParams<{ address: string }>()
  const navigate = useNavigate()

  const {
    data: items = [],
    isLoading,
    error
  } = useQuery({
    queryKey: ['creator-page', address],
    enabled: !!address,
    queryFn: () => fetchCreatorItems(address as string, { first: 60 })
  })

  return (
    <div className="collection-page">
      <nav className="collection-page__crumbs" aria-label="Breadcrumb">
        <button className="collection-page__crumb-link" onClick={() => navigate('/assets')}>
          Collectibles
        </button>
        <span className="collection-page__crumb-sep">/</span>
        <span className="collection-page__crumb-current">Creator</span>
      </nav>

      <header className="collection-page__head">
        {address ? <CreatorBadge address={address} className="collection-page__title-creator" /> : null}
        {address ? <FollowButton address={address} /> : null}
        <span className="muted collection-page__count">
          {isLoading ? '…' : `${items.length.toLocaleString()} item${items.length === 1 ? '' : 's'}`}
        </span>
      </header>

      {!isLoading && items.length > 0 ? <AddAllToCart items={items} source="creator" /> : null}

      {error ? <p className="error">{(error as Error).message}</p> : null}

      <div className="grid">
        {isLoading
          ? Array.from({ length: 12 }).map((_, i) => <div className="card card--skeleton" key={i} />)
          : items.map(item => <AssetCard key={item.id} item={item} />)}
      </div>

      {!isLoading && !error && items.length === 0 ? (
        <p className="muted">This creator has no items to show yet.</p>
      ) : null}
    </div>
  )
}

export default Creator
