import { useNavigate } from 'react-router-dom'
import { type CollectionMeta } from '~/lib/collections'
import { CreatorBadge } from '~/components/CreatorBadge'
import { CollectionMosaic, useCollectionPreview } from '~/components/CollectionThumb'
import { t } from '~/intl/i18n'
import './collection-card.css'

export type CollectionCardProps = {
  collection: CollectionMeta
  // Optional overrides for callers that already hold these (skips the per-card items fetch):
  // a ready cover image URL, and/or the total item count. When omitted, the card derives both from
  // a single lightweight items fetch — the mosaic cover from the items, the count from its total.
  cover?: string
  itemCount?: number
}

// A grid card representing a whole collection: cover, name, "By {creator}", and its item count.
// The card is the primary way into a collection page; on hover/focus (and always on touch, which has
// no hover) it reveals an explicit "View collection" action. Mirrors AssetCard's cerise-gradient
// hover border + violet glow so collection and item cards read as one family.
export function CollectionCard({ collection, cover, itemCount }: CollectionCardProps) {
  const navigate = useNavigate()
  const { contractAddress, name, creator } = collection

  // Only fetch when we actually need to synthesize something — either override present skips the work.
  // Shares the query key with the mosaic, so cover + count come from ONE request (see CollectionThumb).
  const needsItems = cover == null || itemCount == null
  const { data } = useCollectionPreview(contractAddress, needsItems)

  const mosaic = cover == null ? (data?.items ?? []) : []
  const count = itemCount ?? data?.total

  function open() {
    navigate(`/collection/${contractAddress}`)
  }

  return (
    <article
      className="coll-card"
      role="link"
      tabIndex={0}
      onClick={open}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          open()
        }
      }}
    >
      <div className="coll-card__media">
        {cover ? (
          <img className="coll-card__img" src={cover} alt="" loading="lazy" />
        ) : mosaic.length > 0 ? (
          <CollectionMosaic items={mosaic} className="coll-card__cover" />
        ) : null}
      </div>

      <div className="coll-card__body">
        <h3 className="coll-card__name" title={name}>
          {name}
        </h3>
        <div className="coll-card__meta">
          {creator ? (
            <CreatorBadge address={creator} className="coll-card__creator" linkToProfile />
          ) : (
            <span className="coll-card__creator">&nbsp;</span>
          )}
          <span className="coll-card__count">
            {count == null ? '…' : t('collectionCard.itemCount', { count })}
          </span>
        </div>
        <button
          className="coll-card__view"
          onClick={e => {
            e.stopPropagation()
            open()
          }}
          tabIndex={-1}
        >
          {t('collectionCard.viewCollection')}
        </button>
      </div>
    </article>
  )
}

export default CollectionCard
