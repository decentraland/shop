import styled from '@emotion/styled'
import { theme } from '~/styles/theme'
import { CreatorBadge } from '~/components/CreatorBadge'
import { CollectionMosaic } from '~/components/CollectionThumb'

const { colors, gradients, radius, media } = theme

// Same 2px gradient-border-in-the-border-box trick as AssetCard: a transparent base border over a white
// fill, swapped to the cerise gradient + violet glow on hover with NO layout shift. The media flex-grows
// and yields space when the "View collection" button appears, so the card's height never changes.
export const Card = styled.article`
  height: 300px;
  background:
    linear-gradient(#fff, #fff) padding-box,
    linear-gradient(${colors.line}, ${colors.line}) border-box;
  border: 2px solid transparent;
  border-radius: ${radius.card};
  overflow: hidden;
  display: flex;
  flex-direction: column;
  cursor: pointer;
  transition:
    background 0.15s ease,
    box-shadow 0.15s ease;

  &:hover,
  &:focus-visible {
    background:
      linear-gradient(#fff, #fff) padding-box,
      ${gradients.cerise} border-box;
    box-shadow: 0 0 8px 0 ${colors.brandViolet};
    outline: none;
  }
  &:hover [data-view],
  &:focus-within [data-view] {
    display: flex;
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

// The shared mosaic (CollectionThumb) at cover scale: a wider gap + the (transparent) item thumbnails
// CONTAINed with padding, so whole wearables show instead of being cropped.
export const Cover = styled(CollectionMosaic)`
  gap: 2px;

  & [data-testid='coll-thumb-cell'] img {
    object-fit: contain;
    padding: 10px;
  }
`

// Body pinned to the bottom; grows to fit the button on hover, and the media absorbs it.
export const Body = styled.div`
  flex: 0 0 auto;
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

// Filled amethyst button: hidden at rest on hover-capable devices, revealed on card hover/focus-within
// (see Card), always shown on touch (no hover). tabIndex -1 keeps it out of the tab order (card is a link).
export const View = styled.button`
  display: none;
  width: 100%;
  align-items: center;
  justify-content: center;
  height: 44px;
  background: ${gradients.amethyst};
  color: ${colors.softWhite};
  border: 0;
  border-radius: ${radius.btn};
  font-weight: 700;
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.046em;
  transition: filter 0.15s ease;

  @media (hover: none) {
    display: flex;
  }
  &:hover {
    filter: brightness(1.08);
  }
`
