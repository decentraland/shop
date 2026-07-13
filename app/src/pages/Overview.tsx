import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { fetchListings, type CatalogItem } from '~/lib/api'
import { AssetCard } from '~/components/AssetCard'
import { FollowedCreatorsRow } from '~/components/FollowedCreatorsRow'
import { RecentlyViewed } from '~/components/RecentlyViewed'

function Row({ title, items, loading }: { title: string; items: CatalogItem[]; loading: boolean }) {
  return (
    <section className="row">
      <div className="row__head">
        <h2 className="row__title">{title}</h2>
        <Link className="row__viewall" to="/assets">View all <span className="ico ico-viewall" aria-hidden /></Link>
      </div>
      <div className="row__track">
        {loading
          ? Array.from({ length: 6 }).map((_, i) => <div className="card card--skeleton" key={i} />)
          : items.map(item => <AssetCard key={item.id} item={item} />)}
      </div>
    </section>
  )
}

export function Overview() {
  // Only credit-buyable (USD-pegged) listings — not the primary mint catalog.
  const { data, isLoading } = useQuery({ queryKey: ['overview-listings'], queryFn: () => fetchListings({ first: 24 }) })
  const items = data?.items ?? []

  return (
    <div className="overview">
      <section className="hero">
        <div className="hero__inner">
          <h1 className="hero__title">FASHION WEEK OUTFITS</h1>
          <Link className="btn btn--purple" to="/assets">EXPLORE COLLECTION</Link>
        </div>
      </section>

      <FollowedCreatorsRow />
      <RecentlyViewed />

      {isLoading || items.length > 0 ? (
        <>
          <Row title="Featured" items={items.slice(0, 12)} loading={isLoading} />
          {items.length > 12 ? <Row title="New Creations" items={items.slice(12, 24)} loading={false} /> : null}
        </>
      ) : (
        <div className="overview__empty">
          <p className="overview__empty-title">New drops are on the way</p>
          <p className="muted">There are no items on sale right now — check back soon.</p>
          <Link className="btn btn--purple" to="/assets">Browse Collectibles</Link>
        </div>
      )}
    </div>
  )
}
