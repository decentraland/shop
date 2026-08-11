import styled from '@emotion/styled'
import { theme } from '~/styles/theme'
import { ringHairline, ringLit, ringHover } from '~/styles/card.styles'
import { CreatorBadge } from '~/components/CreatorBadge'
import { CollectionMosaic } from '~/components/CollectionThumb'

const { colors, radius, media } = theme

// Inset overlay ring (shared with AssetCard): a hairline at rest, the cerise gradient + violet glow when
// lit, swapped with no layout shift. On hover the "View collection" button takes the creator/count row's
// place inside their shared slot, so nothing about the card's layout moves.
//
// No `overflow: hidden`, as on AssetCard — the lit ring sits outside the card box, so the mosaic and the
// footer round their own corners.
export const Card = styled.article`
  height: 300px;
  /* No fill of its own (Figma 922:183803): the mosaic covers the top and the footer paints its own
     translucent black, so the page field is what shows through the corners. */
  background: transparent;
  border-radius: ${radius.card};
  position: relative;
  isolation: isolate;
  display: flex;
  flex-direction: column;
  cursor: pointer;
  transition: box-shadow 0.15s ease;

  &::after {
    ${ringHairline};
  }

  &:focus-visible {
    ${ringLit};
  }
  &:focus-visible::after {
    ${ringHover};
  }

  // The swap is a pointer affordance only: keyboard focus must not hide the creator row, whose profile
  // link is focusable (visibility: hidden would drop it from the tab order). Enter/Space on the card
  // already opens the collection.
  @media (hover: hover) {
    &:hover {
      ${ringLit};
      /* No zoom, unlike AssetCard — the footer row already swaps, and scaling would nudge every label.
         z-index still matters: the ring and glow paint outside the box, under the next card otherwise. */
      z-index: 1;
    }
    &:hover::after {
      ${ringHover};
    }
    &:hover [data-view] {
      visibility: visible;
    }
    &:hover [data-meta] {
      visibility: hidden;
    }
  }
`

export const Media = styled.div`
  position: relative;
  flex: 1;
  min-height: 0;
  background: ${colors.media};
  overflow: hidden;
  border-radius: ${radius.card} ${radius.card} 0 0;
`

export const Img = styled.img`
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
`

// The shared mosaic (CollectionThumb) at cover scale: the item thumbnails CONTAINed with padding, so whole
// wearables show instead of being cropped. The card passes tinted={false}, so each cell is the plain media
// fill and the transparent thumbnails read as sitting on the card's own background.
export const Cover = styled(CollectionMosaic)`
  & [data-testid='coll-thumb-cell'] img {
    object-fit: contain;
    padding: 10px;
  }
`

// Fixed 102px footer — enough for the swap slot to hold the View button at its natural height. The media
// takes the rest. The translucent black is the footer's own fill (Figma 922:183642).
export const Body = styled.div`
  flex: 0 0 102px;
  height: 102px;
  padding: 12px 12px 16px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: ${colors.overlay};
  border-radius: 0 0 ${radius.card} ${radius.card};
`

export const Name = styled.h3`
  margin: 0;
  font-weight: 700;
  font-size: 16px;
  line-height: 1.6;
  color: ${colors.white};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  ${media.maxWidth('mobile')} {
    font-size: 16px;
  }
`

// One cell holding BOTH the creator/count row and the hover action, stacked and centred in the footer's
// remaining space. They only swap `visibility`, so each keeps its own height and nothing reflows.
export const Slot = styled.div`
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-areas: 'stack';
  align-items: center;

  & > * {
    grid-area: stack;
  }
`

export const Meta = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
`

// Unlike AssetCard, show the avatar: "By" in Gray 4, the name in white (Figma 922:183668).
export const Creator = styled(CreatorBadge)`
  min-width: 0;
  color: ${colors.gray4};

  & [data-avatar] {
    width: 24px;
    height: 24px;
  }
  & [data-testid='creator-name'] {
    font-size: 14px;
  }
  & [data-testid='creator-display'] {
    color: ${colors.white};
    font-weight: 600;
  }
`

// Placeholder that reserves the creator row when a collection has no creator.
export const CreatorEmpty = styled.span`
  min-width: 0;
`

export const Count = styled.span`
  flex: none;
  color: ${colors.gray4};
  font-weight: 600;
  font-size: 14px;
  white-space: nowrap;
`

// The hover state's VIEW COLLECTION (Figma 2202:456747): the outlined-secondary pill, hidden at rest and
// revealed over the creator/count row on card hover or focus (see Card + Slot). Touch devices have no
// hover and the whole card already navigates, so there the row keeps its place and this stays hidden.
// tabIndex -1 keeps it out of the tab order (the card is the link).
export const View = styled.button`
  visibility: hidden;
  width: 100%;
  height: 46px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${colors.overlay};
  color: ${colors.softWhite};
  border: 0;
  border-radius: ${radius.card};
  font-weight: 600;
  font-size: 13px;
  line-height: 24px;
  text-transform: uppercase;
  letter-spacing: 0.46px;
  transition: background 0.15s ease;

  &:hover,
  &:active {
    background: ${colors.text2};
  }
`
