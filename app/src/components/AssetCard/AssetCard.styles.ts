import styled from '@emotion/styled'
import { Link } from 'react-router-dom'
import { theme } from '~/styles/theme'
import { CreatorBadge } from '~/components/CreatorBadge'
import { SaleCountdown } from '~/components/SaleCountdown'

const { colors, gradients, radius, media } = theme

// The 2px border is a gradient painted in the border box via background-clip: the white fill clips to
// padding-box, the border layer shows through the 2px ring. At rest it's the subtle --line hairline;
// on hover it swaps to the cerise gradient + violet glow. The ring stays 2px transparent in both
// states so the swap causes no layout shift. Hover is gated to hover-capable devices so a touch tap
// (which synthesizes :hover) never flashes the border, and it doubles as the action/chips reveal.
export const Card = styled.article`
  height: 300px;
  background:
    linear-gradient(#fff, #fff) padding-box,
    linear-gradient(${colors.line}, ${colors.line}) border-box;
  border-radius: ${radius.card};
  overflow: hidden;
  position: relative;
  border: 2px solid transparent;
  display: flex;
  flex-direction: column;
  transition:
    background 0.15s ease,
    box-shadow 0.15s ease;

  @media (hover: hover) {
    &:hover,
    &:focus-within {
      background:
        linear-gradient(#fff, #fff) padding-box,
        ${gradients.cerise} border-box;
      box-shadow: 0 0 8px 0 ${colors.brandViolet};
    }
    &:hover [data-testid='card-cart'] {
      display: flex;
    }
    &:hover [data-chips] {
      display: none;
    }
  }
`

// Transparent whole-card navigation overlay: above the media so a click anywhere navigates, but below
// the fav/creator/action controls (z-index 4) so those stay independently clickable.
export const CardLink = styled(Link)`
  position: absolute;
  inset: 0;
  z-index: 3;
`

export const Fav = styled.button`
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 4;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 0;
  background: rgba(255, 255, 255, 0.85);
  display: grid;
  place-items: center;
  color: ${colors.text};

  &[data-on] {
    color: ${colors.dclRed};
  }
`

// isolation: isolate makes the media its own stacking context so overlays layer within it.
export const Media = styled.div`
  position: relative;
  isolation: isolate;
  flex: 1;
  min-height: 0;
  background: ${colors.media};
  overflow: hidden;

  ${media.maxWidth('sm')} {
    aspect-ratio: 201 / 213;
  }
`

// Corner ribbon on the media (fav sits top-right, so this anchors top-left).
export const SaleBadge = styled.span`
  position: absolute;
  top: 10px;
  left: 10px;
  z-index: 4;
  display: inline-flex;
  align-items: center;
  background: ${colors.dclRed};
  color: #fff;
  font-weight: 800;
  font-size: 11px;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  border-radius: 6px;
  padding: 4px 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
`

// The flat thumbnail crossfades out once the shared 3D preview (HoverPreviewLayer) has this item ready.
export const Img = styled.img`
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
  transition: opacity 0.25s ease;

  &[data-hidden] {
    opacity: 0;
  }
`

// Fixed 96px footer. On mobile it becomes a grid (name/creator row, then price + round add) — see Top.
export const Body = styled.div`
  flex: 0 0 96px;
  height: 96px;
  padding: 8px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 4px;

  @media (hover: hover) {
    &:focus-within [data-testid='card-cart'] {
      display: flex;
    }
    &:focus-within [data-chips] {
      display: none;
    }
  }

  ${media.maxWidth('sm')} {
    display: grid;
    height: auto;
    grid-template-columns: 1fr auto;
    grid-template-areas: 'desc desc' 'price add';
    align-items: center;
    row-gap: 10px;
    padding: 8px;
  }
`

// On mobile `display: contents` promotes the name/creator column and the price into Body's grid so they
// place as the Figma mobile card; without it the flex row overflows the narrow card and clips the price.
export const Top = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 10px;

  ${media.maxWidth('sm')} {
    display: contents;
  }
`

// min-width:0 lets the name ellipsis kick in instead of pushing the price off the card.
export const Desc = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;

  ${media.maxWidth('sm')} {
    grid-area: desc;
    min-width: 0;
  }
`

export const Name = styled.div`
  font-weight: 600;
  font-size: 14px;
  line-height: 1.35;
  color: ${colors.text};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  ${media.maxWidth('sm')} {
    font-size: 12px;
  }
`

// On the card we show just "By AuthorName" — the badge's avatar is hidden (it renders elsewhere).
export const Creator = styled(CreatorBadge)`
  position: relative;
  z-index: 4;
  color: ${colors.muted};
  font-size: 10px;
  margin-bottom: 2px;

  & [data-avatar] {
    display: none;
  }
`

// Reserves the creator line's height when an item has no creator.
export const CreatorEmpty = styled.div`
  font-size: 10px;
  margin-bottom: 2px;
`

// Price never shrinks or wraps — the name yields space to it. The sale variant wraps (was-price +
// countdown), and market drops the gap for the leading "≈".
export const Price = styled.div`
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  font-size: 16px;
  color: ${colors.text2};
  white-space: nowrap;

  &[data-variant='sale'] {
    white-space: normal;
    flex-wrap: wrap;
    justify-content: flex-end;
    max-width: 58%;
    gap: 6px 10px;
  }
  &[data-variant='market'] {
    gap: 4px;
  }

  ${media.maxWidth('sm')} {
    grid-area: price;
    align-self: center;
    justify-self: start;
  }
`

export const PriceNow = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: ${colors.dclRed};
  font-weight: 700;
`

export const PriceWas = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: ${colors.muted};
  text-decoration: line-through;
  font-weight: 600;
  font-size: 14px;
`

export const Approx = styled.span`
  font-weight: 700;
  color: ${colors.muted};
`

export const Countdown = styled(SaleCountdown)`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: ${colors.rarityBg};
  color: ${colors.accent};
  font-size: 11px;
  font-weight: 700;
  border-radius: 6px;
  padding: 2px 8px;
  white-space: nowrap;
`

// Fixed-height slot: the full-width action button (Cart) swaps in for the chips on hover/focus without
// changing the card's height.
export const Action = styled.div`
  min-height: 40px;
  display: flex;
  align-items: center;

  ${media.maxWidth('sm')} {
    grid-area: add;
    align-self: center;
    justify-self: end;
    min-height: 0;
  }
`

// Marketplace-style chips. All share one fixed height so they line up. The context rules target the
// shared global `.chip*` / `.ico` classes the children still carry. Hidden on mobile (round add is used).
export const Chips = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;

  & .chip {
    height: 18px;
    font-size: 10px;
    line-height: 1;
    font-weight: 600;
    padding: 0 6.5px;
    letter-spacing: 0.01em;
    border-radius: 4px;
  }
  & .chip--icon {
    padding: 0 5px;
  }
  & .chip--icon .ico {
    width: 14.6px;
    height: 14.6px;
  }
  & .chip--smart {
    gap: 2px;
    padding: 4px 4px 4px 2px;
    background: ${colors.chip};
    color: ${colors.text2};
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }
  & .chip--market {
    background: ${colors.rarityBg};
    color: ${colors.accent};
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }

  ${media.maxWidth('sm')} {
    display: none;
  }
`

// The compact mobile card's primary action (Figma) — hidden on desktop, where the full-width Cart is used.
export const AddRound = styled.button`
  display: none;

  ${media.maxWidth('sm')} {
    align-self: center;
    justify-self: end;
    z-index: 4;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: 0;
    padding: 0;
    background: ${colors.accent};
    color: #fff;
    cursor: pointer;

    &:disabled {
      opacity: 0.5;
      cursor: default;
    }
  }
`

// Add to cart / Buy now (Figma secondary dark button). Hidden at rest on hover-capable devices and
// revealed on card hover / body focus (see Card + Body); always shown where hover isn't available so
// items stay buyable without a mouse. z-index keeps it above the whole-card overlay link.
export const Cart = styled.button`
  position: relative;
  z-index: 4;
  width: 100%;
  display: none;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: ${colors.blackBtn};
  color: ${colors.softWhite};
  border: 0;
  border-radius: ${radius.btn};
  height: 40px;
  font-weight: 600;
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.046em;
  transition: background 0.15s ease;

  @media (hover: none) and (min-width: 721px) {
    display: flex;
  }
  &:hover:not(:disabled) {
    background: #43404a;
  }
  &[data-in],
  &:disabled {
    background: #43404a;
    opacity: 1;
    cursor: default;
  }

  ${media.maxWidth('sm')} {
    display: none;
  }
`
