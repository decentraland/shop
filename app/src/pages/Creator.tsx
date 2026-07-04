import { useNavigate, useParams } from 'react-router-dom'
import { fetchCreatorItems } from '~/lib/collections'
import { AssetCard } from '~/components/AssetCard'
import { CreatorBadge } from '~/components/CreatorBadge'
import { FollowButton } from '~/components/FollowButton'
import { AddAllToCart } from '~/components/AddAllToCart'
import { SkeletonCards } from '~/components/SkeletonCards'
import { LoadMore } from '~/components/LoadMore'
import { useInfiniteGrid } from '~/hooks/useInfiniteGrid'
import './collection.css'

const PAGE_SIZE = 48

// A creator's storefront: every item they made, in a grid. Discovery that feeds the North Star
// (help buyers find + buy more from a creator). Uses /v1/items?creator= — no backend change.
export function Creator() {
  const { address } = useParams<{ address: string }>()
  const navigate = useNavigate()

  const { items, total, isLoading, error, hasNextPage, isFetchingNextPage, fetchNextPage } = useInfiniteGrid(
    ['creator-page', address],
    skip => fetchCreatorItems(address as string, { first: PAGE_SIZE, skip }),
    { enabled: !!address }
  )

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
          {isLoading ? '…' : `${total.toLocaleString()} item${total === 1 ? '' : 's'}`}
        </span>
      </header>

      {!isLoading && items.length > 0 ? <AddAllToCart items={items} source="creator" /> : null}

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
        <p className="muted">This creator has no items to show yet.</p>
      ) : null}
    </div>
  )
}

export default Creator
