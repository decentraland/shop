import styled from '@emotion/styled'
import { theme } from '~/styles/theme'
import { ringHairline, ringLit, ringHover } from '~/styles/card.styles'
import { CreatorBadge } from '~/components/CreatorBadge'
import { CollectionMosaic } from '~/components/CollectionThumb'

const { colors, radius, media } = theme

// Inset overlay ring (shared with AssetCard): a 0.5px hairline at rest, the 2px cerise gradient + violet
// glow when lit, swapped with no layout shift. On hover the "View collection" button takes the creator/count
// row's place inside their shared slot, so nothing about the card's layout moves.
export const Card = styled.article`
  height: 300px;
  background: ${colors.bg};
  border-radius: ${radius.card};
  overflow: hidden;
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
// takes the rest.
export const Body = styled.div`
  flex: 0 0 102px;
  height: 102px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
`

export const Name = styled.h3`
  margin: 0;
  font-weight: 700;
  font-size: 18px;
  line-height: 1.3;
  color: ${colors.text};
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

// Unlike AssetCard, show the avatar and paint the name cerise (the "By" stays muted).
export const Creator = styled(CreatorBadge)`
  min-width: 0;
  color: ${colors.muted};

  & [data-avatar] {
    width: 24px;
    height: 24px;
  }
  & [data-testid='creator-name'] {
    font-size: 14px;
  }
  & [data-testid='creator-display'] {
    color: ${colors.dclRed};
    font-weight: 700;
  }
`

// Placeholder that reserves the creator row when a collection has no creator.
export const CreatorEmpty = styled.span`
  min-width: 0;
`

export const Count = styled.span`
  flex: none;
  color: ${colors.text};
  font-weight: 600;
  font-size: 14px;
  white-space: nowrap;
`

// Filled amethyst button, hidden at rest and revealed over the creator/count row on card hover or focus
// (see Card + Slot). Touch devices have no hover and the whole card already navigates, so there the row
// keeps its place and this stays hidden. tabIndex -1 keeps it out of the tab order (the card is the link).
export const View = styled.button`
  visibility: hidden;
  width: 100%;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${colors.accent};
  color: ${colors.softWhite};
  border: 0;
  border-radius: ${radius.btn};
  font-weight: 700;
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.046em;
  transition: background 0.15s ease;

  &:hover {
    background: ${colors.accentHover};
  }
  &:active {
    background: ${colors.accentActive};
  }
`
