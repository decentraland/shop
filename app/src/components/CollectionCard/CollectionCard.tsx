import { useNavigate } from 'react-router-dom'
import { type CollectionMeta } from '~/lib/collections'
import { useCollectionPreview } from '~/components/CollectionThumb'
import { t } from '~/intl/i18n'
import * as S from './CollectionCard.styles'

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
    <S.Card
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
      <S.Media>
        {cover ? (
          <S.Img data-testid="coll-card-img" src={cover} alt="" loading="lazy" />
        ) : mosaic.length > 0 ? (
          <S.Cover items={mosaic} />
        ) : null}
      </S.Media>

      <S.Body>
        <S.Name title={name}>{name}</S.Name>
        <S.Meta>
          {creator ? <S.Creator address={creator} linkToProfile /> : <S.CreatorEmpty>&nbsp;</S.CreatorEmpty>}
          <S.Count>{count == null ? '…' : t('collectionCard.itemCount', { count })}</S.Count>
        </S.Meta>
        <S.View
          data-view
          onClick={e => {
            e.stopPropagation()
            open()
          }}
          tabIndex={-1}
        >
          {t('collectionCard.viewCollection')}
        </S.View>
      </S.Body>
    </S.Card>
  )
}

export default CollectionCard
