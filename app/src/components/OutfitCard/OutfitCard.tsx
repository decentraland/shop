import type { MouseEvent } from 'react'
import { CurrencyIcon } from '~/components/CurrencyIcon'
import { Icon } from '~/components/Icon'
import { Price } from '~/components/Price'
import { useOutfitCart, type OutfitItemsResolution } from '~/hooks/useOutfits'
import { outfitFade, outfitGradient, thumbnailUrl, type Outfit } from '~/lib/outfits'
import { t } from '~/intl/i18n'
import * as S from './OutfitCard.styles'

type Availability = 'full' | 'partial' | 'none' | 'resolving' | 'error'

// A curated outfit as one shoppable card: uploaded thumbnail, live total, add-all CTA. The card
// body navigates to the detail page; the CTA adds without navigating. The row only renders outfits
// whose every item is buyable, so the card never voices a partial state — its CTA always reads
// "Add to cart" (viewer-specific cases, e.g. everything already in the cart, just disable it). A
// catalog outage renders as "no total / no CTA", never as "no longer available" — an outage is not
// a sell-out.
export function OutfitCard({ outfit, resolution }: { outfit: Outfit; resolution: OutfitItemsResolution }) {
  const { split, availableCount, totalCredits, addOutfit, isAdding } = useOutfitCart(outfit, resolution)
  const total = outfit.items.length
  // Null on a draft with no thumbnail yet (the studio's live card preview) — the gradient frame
  // behind it is the whole card at that point, so there is simply nothing to lay over it.
  const thumb = thumbnailUrl(outfit.thumbnailHash)

  const availability: Availability = resolution.isError
    ? 'error'
    : resolution.isLoading
      ? 'resolving'
      : availableCount === 0
        ? 'none'
        : availableCount < total
          ? 'partial'
          : 'full'

  function onAdd(event: MouseEvent) {
    // Inside the card <Link> — adding must not navigate.
    event.preventDefault()
    event.stopPropagation()
    addOutfit()
  }

  return (
    <S.Card to={`/items/outfits/${outfit.id}`} data-testid="outfit-card" data-availability={availability}>
      {/* Thumbnails are uploaded with a transparent background, so the creator's gradient is what
          the look actually sits on. */}
      <S.Frame data-card-frame data-testid="outfit-card-thumb" style={{ background: outfitGradient(outfit) }} />
      <S.Mask>{thumb ? <S.Thumb data-card-media src={thumb} alt={outfit.name} loading="lazy" /> : null}</S.Mask>
      <S.Fade data-card-fade style={{ background: outfitFade(outfit) }} />
      <S.Scrim data-card-scrim />
      <S.Body data-card-reveal data-testid="outfit-card-info">
        <S.TopRow>
          <S.Name>{outfit.name}</S.Name>
          <S.Meta>{t('outfits.card.items', { count: total })}</S.Meta>
          {availability === 'resolving' ? (
            <S.Price>
              <span className="skeleton" style={{ width: 56, height: 18 }} />
            </S.Price>
          ) : availability === 'full' || availability === 'partial' ? (
            <S.Price>
              <CurrencyIcon size={16} /> <Price credits={totalCredits} />
            </S.Price>
          ) : null}
        </S.TopRow>
        {availability === 'error' ? null : (
          <S.Cta
            variant="white"
            data-testid="outfit-card-cta"
            onClick={onAdd}
            disabled={isAdding || split.purchasable.length === 0}
            aria-busy={isAdding || undefined}
          >
            <Icon name="cart-solid" />
            {isAdding ? t('outfits.card.adding') : t('outfits.card.add')}
          </S.Cta>
        )}
      </S.Body>
    </S.Card>
  )
}

export default OutfitCard
