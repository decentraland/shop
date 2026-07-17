import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchCollectionItems } from '~/lib/collections'
import type { CatalogItem } from '~/lib/api'
import { rarityGradient } from '~/lib/rarity'
import './collection-thumb.css'

// Collections carry no image of their own, so their "thumbnail" is synthesized from a mosaic of the
// collection's first few item thumbnails, each over its rarity-colored gradient. This is the single
// implementation shared by the search suggestions (small rounded tile) and the CollectionCard (large
// cover) — callers size/shape it via `className`; the grid layout adapts to the item count.
const MOSAIC_COUNT = 4

// The lightweight fetch that backs both the mosaic and (for the card) the item count. Keyed so the
// card's count read and the mosaic render dedupe to ONE request per collection.
export function useCollectionPreview(contractAddress: string, enabled = true) {
  return useQuery({
    queryKey: ['collection-preview', contractAddress],
    queryFn: () => fetchCollectionItems(contractAddress, { first: MOSAIC_COUNT }),
    enabled,
    staleTime: 5 * 60_000
  })
}

// Presentational mosaic — the grid of item thumbnails, no fetching. `data-count` (1–4) reshapes the
// grid so any number of items looks intentional (see collection-thumb.css).
export function CollectionMosaic({ items, className }: { items: CatalogItem[]; className?: string }) {
  const cells = items.slice(0, MOSAIC_COUNT)
  return (
    <span className={`coll-thumb${className ? ` ${className}` : ''}`} data-count={cells.length} aria-hidden>
      {cells.map(item => (
        <span key={item.id} className="coll-thumb__cell" style={{ backgroundImage: rarityGradient(item.rarity) }}>
          {item.thumbnail ? <img src={item.thumbnail} alt="" loading="lazy" /> : null}
        </span>
      ))}
    </span>
  )
}

// Self-fetching mosaic for the collection's contract address. Renders `fallback` while loading or when
// the collection has no items (e.g. the neutral icon tile in search).
export function CollectionThumb({
  contractAddress,
  className,
  fallback = null
}: {
  contractAddress: string
  className?: string
  fallback?: ReactNode
}) {
  const { data } = useCollectionPreview(contractAddress)
  const items = data?.items ?? []
  if (items.length === 0) return <>{fallback}</>
  return <CollectionMosaic items={items} className={className} />
}
