import { useNavigate } from 'react-router-dom'
import type { CatalogItem } from '~/lib/api'
import { capitalizeFirst } from '~/lib/text'
import * as S from '~/components/CreatorBadge/badge.styles'
import { Collage } from './CollectionBadge.styles'

// The collection a PDP item belongs to (thumbnail collage + name), linking to the collection
// storefront. Mirrors the marketplace webapp's CollectionImage: a 2×2 collage of up to 4 item
// thumbnails (row 1 = items[0..2], row 2 = items[2..4]); a single full-width row when only two
// resolve. Falls back to the name alone while thumbnails load. Renders nothing until the name resolves.
export function CollectionBadge({
  contractAddress,
  name,
  items,
  className
}: {
  contractAddress?: string
  name?: string
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
    <S.Root
      as="button"
      data-link
      className={className}
      data-testid="creator"
      onClick={e => {
        e.stopPropagation()
        navigate(`/collection/${contractAddress}`)
      }}
    >
      {thumbs.length > 0 ? (
        <Collage as="span" data-avatar data-testid="creator-ava" aria-hidden>
          <span className={`collection-collage__row${row2.length === 0 ? ' collection-collage__row--full' : ''}`}>
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
        </Collage>
      ) : null}
      <S.Name data-testid="creator-name">{capitalizeFirst(name)}</S.Name>
    </S.Root>
  )
}
