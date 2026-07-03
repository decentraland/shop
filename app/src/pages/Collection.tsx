import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { fetchCollectionItems } from '~/lib/collections'
import { AssetCard } from '~/components/AssetCard'
import { CreatorBadge } from '~/components/CreatorBadge'
import { AddAllToCart } from '~/components/AddAllToCart'
import './collection.css'

// A full-collection storefront: every item of one collection in a grid (discovery — drives more
// primary sales than the item-detail carousel alone). Reuses the shop catalog fetch + AssetCard.
export function Collection() {
  const { contractAddress } = useParams<{ contractAddress: string }>()
  const navigate = useNavigate()

  const {
    data: items = [],
    isLoading,
    error
  } = useQuery({
    queryKey: ['collection-page', contractAddress],
    enabled: !!contractAddress,
    queryFn: () => fetchCollectionItems(contractAddress as string, { first: 60 })
  })

  const creator = items[0]?.creator

  return (
    <div className="collection-page">
      <nav className="collection-page__crumbs" aria-label="Breadcrumb">
        <button className="collection-page__crumb-link" onClick={() => navigate('/assets')}>
          Collectibles
        </button>
        <span className="collection-page__crumb-sep">/</span>
        <span className="collection-page__crumb-current">Collection</span>
      </nav>

      <header className="collection-page__head">
        <h1 className="collection-page__title">Collection</h1>
        {creator ? <CreatorBadge address={creator} className="collection-page__creator" /> : null}
        <span className="muted collection-page__count">
          {isLoading ? '…' : `${items.length.toLocaleString()} item${items.length === 1 ? '' : 's'}`}
        </span>
      </header>

      {!isLoading && items.length > 0 ? <AddAllToCart items={items} source="collection" /> : null}

      {error ? <p className="error">{(error as Error).message}</p> : null}

      <div className="grid">
        {isLoading
          ? Array.from({ length: 12 }).map((_, i) => <div className="card card--skeleton" key={i} />)
          : items.map(item => <AssetCard key={item.id} item={item} />)}
      </div>

      {!isLoading && !error && items.length === 0 ? (
        <p className="muted">This collection has no items to show.</p>
      ) : null}
    </div>
  )
}

export default Collection
