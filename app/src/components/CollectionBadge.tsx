import { useNavigate } from 'react-router-dom'
import type { CatalogItem } from '~/lib/api'

// The collection a PDP item belongs to (thumbnail collage + name), linking to the collection
// storefront. Mirrors the marketplace webapp's CollectionImage: a 2×2 collage of up to 4 item
// thumbnails from the collection (row 1 = items[0..2], row 2 = items[2..4]); a single full-width row
// when only two thumbnails resolve. Falls back to the name alone while the items (with thumbnails)
// load. Renders nothing until the name resolves.

export function CollectionBadge({
  contractAddress,
  name,
  items,
  className,
}: {
  contractAddress?: string
  name?: string
  // Collection items carrying thumbnails (ItemDetail passes the fetched siblings). Up to 4 are
  // collaged into the badge; graceful name-only fallback when none have loaded yet.
  items?: CatalogItem[]
  className?: string
}) {
  const navigate = useNavigate()
  if (!contractAddress || !name) return null

  const thumbs = (items ?? [])
    .map(i => i.thumbnail)
    .filter((t): t is string => !!t)
    .slice(0, 4)
  const row1 = thumbs.slice(0, 2)
  const row2 = thumbs.slice(2, 4)

  return (
    <button
      className={`creator creator--link${className ? ` ${className}` : ''}`}
      onClick={e => {
        e.stopPropagation()
        navigate(`/collection/${contractAddress}`)
      }}
    >
      {thumbs.length > 0 ? (
        <span className="creator__ava collection-collage" aria-hidden>
          <span
            className={`collection-collage__row${row2.length === 0 ? ' collection-collage__row--full' : ''}`}
          >
            {row1.map((src, i) => (
              <img key={i} src={src} alt="" />
            ))}
          </span>
          {row2.length > 0 ? (
            <span className="collection-collage__row">
              {row2.map((src, i) => (
                <img key={i} src={src} alt="" />
              ))}
            </span>
          ) : null}
        </span>
      ) : null}
      <span className="creator__name">{name}</span>
    </button>
  )
}

export default CollectionBadge
