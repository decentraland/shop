import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { fetchCollectionItems } from '~/lib/collections'
import { fetchCollection } from '~/lib/search'
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

  // Item records don't carry the collection name (it lives on the collections entity), so resolve it
  // separately — mirrors the marketplace's collectionAPI.fetchOne. Falls back to "Collection".
  const { data: collection } = useQuery({
    queryKey: ['collection-meta', contractAddress],
    queryFn: () => fetchCollection(contractAddress as string),
    enabled: !!contractAddress,
    staleTime: 5 * 60_000,
  })

  const title = collection?.name || 'Collection'
  // Prefer the collection's own creator; fall back to an item's creator until the metadata loads.
  const creator = collection?.creator || items[0]?.creator

  return (
    <div className="collection-page">
      <nav className="collection-page__crumbs" aria-label="Breadcrumb">
        <button className="collection-page__crumb-link" onClick={() => navigate('/assets')}>
          Collectibles
        </button>
        <span className="collection-page__crumb-sep">/</span>
        <span className="collection-page__crumb-current">{title}</span>
      </nav>

      <header className="collection-page__head">
        <h1 className="collection-page__title">{title}</h1>
        {creator ? <CreatorBadge address={creator} className="collection-page__creator" /> : null}
        <span className="muted collection-page__count">
          {isLoading ? '…' : `${total.toLocaleString()} item${total === 1 ? '' : 's'}`}
        </span>
      </header>

      {!isLoading && items.length > 0 ? <AddAllToCart items={items} source="collection" /> : null}

      {error ? <p className="error">Couldn&rsquo;t load this collection — please try again.</p> : null}

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
