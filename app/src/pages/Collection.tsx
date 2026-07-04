import { useNavigate, useParams } from 'react-router-dom'
import { fetchCollectionItems } from '~/lib/collections'
import { AssetCard } from '~/components/AssetCard'
import { CreatorBadge } from '~/components/CreatorBadge'
import { AddAllToCart } from '~/components/AddAllToCart'
import { SkeletonCards } from '~/components/SkeletonCards'
import { LoadMore } from '~/components/LoadMore'
import { useInfiniteGrid } from '~/hooks/useInfiniteGrid'
import './collection.css'

const PAGE_SIZE = 48

// A full-collection storefront: every item of one collection in a grid (discovery — drives more
// primary sales than the item-detail carousel alone). Reuses the shop catalog fetch + AssetCard.
export function Collection() {
  const { contractAddress } = useParams<{ contractAddress: string }>()
  const navigate = useNavigate()

  const { items, total, isLoading, error, hasNextPage, isFetchingNextPage, fetchNextPage } = useInfiniteGrid(
    ['collection-page', contractAddress],
    skip => fetchCollectionItems(contractAddress as string, { first: PAGE_SIZE, skip }),
    { enabled: !!contractAddress }
  )

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
          {isLoading ? '…' : `${total.toLocaleString()} item${total === 1 ? '' : 's'}`}
        </span>
      </header>

      {!isLoading && items.length > 0 ? <AddAllToCart items={items} source="collection" /> : null}

      {error ? <p className="error">{error.message}</p> : null}

      <div className="grid">
        {isLoading ? (
          <SkeletonCards count={12} />
        ) : (
          <>
            {items.map(item => <AssetCard key={item.id} item={item} />)}
            {isFetchingNextPage ? <SkeletonCards count={6} /> : null}
          </>
        )}
      </div>

      <LoadMore hasNextPage={hasNextPage} isFetching={isFetchingNextPage} onLoadMore={() => fetchNextPage()} />

      {!isLoading && !error && items.length === 0 ? (
        <p className="muted">This collection has no items to show.</p>
      ) : null}
    </div>
  )
}

export default Collection
