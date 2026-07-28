import styled from '@emotion/styled'
import { css, type SerializedStyles } from '@emotion/react'
import { Link } from 'react-router-dom'
import { theme } from '~/styles/theme'
import { Chip } from '~/styles/chip.styles'
import { CreatorBadge } from '~/components/CreatorBadge'
import { CreatorName } from '~/components/CreatorName'
import { SaleCountdown } from '~/components/SaleCountdown'

const { colors, gradients, radius, media } = theme

// Gap between the name column and the price in the footer's first row. Exported because AssetCard
// measures against it to decide whether the name still fits beside the price.
export const TOP_GAP = 10

// The outline is an inset overlay ring (::after) rather than a real border, so the hairline at rest and
// the 2px cerise gradient on hover swap with zero layout shift — a border-width change would nudge the
// media — and the media still runs edge to edge. The gradient ring is a gradient fill masked down to the
// ring itself (a plain border can't take a gradient, and border-image ignores border-radius). Hover is
// gated to hover-capable devices so a touch tap (which synthesizes :hover) never flashes it, and it
// doubles as the action/chips reveal.
export const Card = styled.article`
  height: 300px;
  background: ${colors.bg};
  border-radius: ${radius.card};
  overflow: hidden;
  position: relative;
  isolation: isolate;
  display: flex;
  flex-direction: column;
  transition: box-shadow 0.15s ease;

  &::after {
    content: '';
    position: absolute;
    inset: 0;
    z-index: 5;
    pointer-events: none;
    border: 0.25px solid ${colors.lineStrong};
    border-radius: inherit;
  }

  @media (hover: hover) {
    &:hover,
    &:focus-within {
      box-shadow: 0 0 8px 0 ${colors.brandViolet};
    }
    &:hover::after,
    &:focus-within::after {
      border: 0;
      padding: 2px;
      background: ${gradients.cerise};
      -webkit-mask:
        linear-gradient(#000 0 0) content-box,
        linear-gradient(#000 0 0);
      mask:
        linear-gradient(#000 0 0) content-box,
        linear-gradient(#000 0 0);
      -webkit-mask-composite: xor;
      mask-composite: exclude;
    }
    &:hover [data-testid='card-cart'],
    &:hover [data-reveal] {
      display: flex;
    }
    &:hover [data-chips] {
      display: none;
    }
  }
`

// Transparent whole-card navigation overlay: above the media so a click anywhere navigates, but below
// the fav/creator/action controls (z-index 4) so those stay independently clickable.
const cardLinkCss = css`
  position: absolute;
  inset: 0;
  z-index: 3;
`

export const CardLink = styled(Link)`
  ${cardLinkCss};
`

// Same overlay for an OFF-app destination (an owned NAME's Builder management page), which needs a
// plain anchor rather than a router Link.
export const CardLinkExternal = styled.a`
  ${cardLinkCss};
`

export const Fav = styled.button`
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 4;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 0;
  padding: 0;
  background: rgba(255, 255, 255, 0.85);
  display: grid;
  place-items: center;
  color: ${colors.text};

  &[data-on] {
    color: ${colors.dclRed};
  }

  & .ico {
    margin-top: 2px;
  }

  // The circle is 24px by design, which is under the comfortable tap size — an invisible ring around it
  // brings the hit area back to ~44px on touch without changing the visual.
  &::after {
    content: '';
    position: absolute;
    inset: -10px;
    border-radius: 50%;
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

// Shimmer over the gray media background while the shared 3D preview boots. z-index -1 (within the
// media's isolate stacking context) keeps it above the gray fill but behind the static thumbnail.
export const Skeleton = styled.div`
  position: absolute;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  background: linear-gradient(
    100deg,
    rgba(255, 255, 255, 0) 30%,
    rgba(255, 255, 255, 0.6) 50%,
    rgba(255, 255, 255, 0) 70%
  );
  background-repeat: no-repeat;
  background-size: 220% 100%;
  animation: card-skeleton 1.3s infinite ease-in-out;

  @keyframes card-skeleton {
    0% {
      background-position: 180% 0;
    }
    100% {
      background-position: -80% 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    animation: none;
    opacity: 0.5;
  }
`

// "N on sale" badge: flags that an item has multiple copies on sale so the user knows there's a resale
// list on the detail page. Anchored bottom-left so it clears the fav button and the flash-sale ribbon.
export const Listings = styled.span`
  position: absolute;
  bottom: 10px;
  left: 10px;
  z-index: 4;
  display: inline-flex;
  align-items: center;
  background: rgba(22, 20, 27, 0.82);
  color: #fff;
  font-weight: 600;
  font-size: 10px;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  border-radius: 6px;
  padding: 3px 7px;
`

// A NAME's media: no thumbnail, just the typographic "@name" tile, violet and centred.
export const NameMedia = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  width: 100%;
  height: 100%;
  padding: 8px;
  color: ${colors.brandViolet};
  text-align: center;
`

export const NameAt = styled.span`
  font-weight: 700;
  font-size: 36px;
  line-height: 1;
`

export const NameValue = styled.span`
  max-width: 100%;
  font-weight: 700;
  font-size: 24px;
  line-height: 1.2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
// data-stacked (a long name, measured in AssetCard) keeps the plain column at every width: the name
// claims the whole first row and the price drops into the action row beside the round button.
export const Body = styled.div`
  flex: 0 0 96px;
  height: 96px;
  padding: 8px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 4px;

  [data-stacked] & {
    display: flex;
    align-items: stretch;
    gap: 10px;
  }

  @media (hover: hover) {
    &:focus-within [data-testid='card-cart'],
    &:focus-within [data-reveal] {
      display: flex;
    }
    &:focus-within [data-chips] {
      display: none;
    }
  }

  // data-name = a NAME card's footer: it hugs its single row (@name + NOT FOR SALE) with a bit more
  // vertical breathing room, and the @name tile above keeps the extra height.
  &[data-name] {
    flex: 0 0 auto;
    height: auto;
    padding-top: 14px;
    padding-bottom: 14px;
  }

  ${media.maxWidth('sm')} {
    display: grid;
    height: auto;
    grid-template-columns: 1fr auto;
    grid-template-areas: 'desc desc' 'price add';
    align-items: center;
    row-gap: 10px;
    padding: 8px;

    // NAME cards have no price/round-add split the wearable grid is built for — keep them a simple
    // stacked column so the mobile layout stays tidy.
    &[data-name] {
      display: flex;
    }
    &[data-name] > * {
      display: flex;
    }
  }
`

// On mobile `display: contents` promotes the name/creator column and the price into Body's grid so they
// place as the Figma mobile card; without it the flex row overflows the narrow card and clips the price.
export const Top = styled.div`
  display: flex;
  align-items: flex-start;
  gap: ${TOP_GAP}px;

  ${media.maxWidth('sm')} {
    display: contents;
  }

  // Stacked: the price has moved out of this row, so it stays a plain box (its width is what the name
  // is measured against) instead of dissolving into the mobile grid.
  [data-stacked] & {
    display: flex;
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

// data-verified = an owned NAME's footer: "@name" beside the violet verified seal.
export const Name = styled.div`
  font-weight: 600;
  font-size: 14px;
  line-height: 1.35;
  color: ${colors.text};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  &[data-verified] {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  ${media.maxWidth('sm')} {
    font-size: 12px;
  }
`

// The DCL verified seal is a Cerise-gradient SVG, so it can't be the currentColor Icon mask.
export const Verified = styled.svg`
  flex: none;
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

// Reserves the creator line's height when an item has no creator. data-issued styles it as the owned
// copy's mint index (e.g. "#5013") — tabular figures so digits align across otherwise-identical copies.
export const CreatorEmpty = styled.div`
  font-size: 10px;
  margin-bottom: 2px;

  &[data-issued] {
    color: ${colors.muted};
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.2px;
  }
`

// "by {creator}" subtitle under the title on the browse card. Single line, ellipsised so a long name
// never pushes the fixed 96px body out of shape.
export const Author = styled(CreatorName)`
  color: ${colors.muted};
  font-size: 11px;
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
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

// "NOT FOR SALE" tag — sits where the price would be on the title row. Never shrinks/wraps, like the
// price it replaces.
export const Nfs = styled.span`
  flex-shrink: 0;
  font-weight: 600;
  font-size: 8px;
  line-height: 20px;
  color: ${colors.muted};
  text-transform: uppercase;
  letter-spacing: 0.02em;
  white-space: nowrap;
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
// changing the card's height. Stacked, it holds the price on the left and the round action on the right.
export const Action = styled.div`
  min-height: 40px;
  display: flex;
  align-items: center;

  [data-stacked] & {
    width: 100%;
    justify-content: space-between;
    gap: ${TOP_GAP}px;
  }

  ${media.maxWidth('sm')} {
    grid-area: add;
    align-self: center;
    justify-self: end;
    min-height: 0;
  }
`

// Marketplace-style chips. All share one fixed height so they line up. Hidden on mobile (round add is used).
export const Chips = styled.div`
  display: flex;
  align-items: center;
  gap: 3px;
  flex-wrap: wrap;
  // Sit on the footer's bottom edge instead of centring in the 40px action slot (which the button that
  // replaces them on hover fills).
  align-self: flex-end;

  ${media.maxWidth('sm')} {
    display: none;
  }
`

// The card's compact chip: smaller and denser than the shared base, with the smart/market variants.
export const CardChip = styled(Chip)`
  height: 18px;
  font-size: 10px;
  line-height: 1;
  font-weight: 600;
  padding: 0 6.5px;
  letter-spacing: 0.01em;
  border-radius: 4px;

  &[data-variant='icon'] {
    padding: 0 5px;
  }
  &[data-variant='icon'] .ico {
    width: 14.6px;
    height: 14.6px;
  }
  &[data-variant='smart'] {
    gap: 2px;
    padding: 4px 4px 4px 2px;
    background: ${colors.chip};
    color: ${colors.text2};
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }
  &[data-variant='market'] {
    background: ${colors.rarityBg};
    color: ${colors.accent};
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }
`

// Full-width dark VIEW affordance on the view-only card. Unlike Cart it's ALWAYS visible (no hover
// reveal) and carries no click handler — the whole-card overlay link navigates. The compact card uses the
// round ViewRound instead.
export const View = styled.span`
  position: relative;
  z-index: 1;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: ${colors.blackBtn};
  color: ${colors.softWhite};
  border-radius: ${radius.btn};
  height: 40px;
  font-weight: 600;
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.046em;

  & .ico {
    width: 20px;
    height: 20px;
  }

  [data-stacked] & {
    display: none;
  }

  ${media.maxWidth('sm')} {
    display: none;
  }
`

// The compact card's round action: 32px circle, no label.
const roundCss = css`
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
  cursor: pointer;
`

// A round action belongs to the compact card only — the mobile card, and any card whose long name pushed
// the price into the action row. Elsewhere the full-width button is used and this is hidden.
const compactRoundCss = (fill: SerializedStyles) => css`
  display: none;

  [data-stacked] & {
    ${roundCss};
    ${fill};
  }

  ${media.maxWidth('sm')} {
    ${roundCss};
    ${fill};
  }
`

const addRoundFill = css`
  background: ${colors.accent};
  color: #fff;

  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
`

// Dark round stand-in for the VIEW button, on a card with nothing to buy.
export const ViewRound = styled.span`
  ${compactRoundCss(css`
    background: ${colors.blackBtn};
    color: ${colors.softWhite};
  `)};
`

// Full-width action on an owned/created card: "List for sale" (dark) or, with data-ghost, "Remove from
// sale" (lighter secondary). Unlike View it carries a real click handler, so its z-index must sit ABOVE
// the whole-card overlay link to stay independently clickable. On My Creations it lives in the swap slot
// and is hidden at rest (data-reveal), revealed on card hover or keyboard focus like Cart; on touch (no
// hover) the base display keeps it visible so it stays operable without a mouse.
export const Manage = styled.button`
  position: relative;
  z-index: 4;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 0;
  border-radius: ${radius.btn};
  height: 40px;
  font-weight: 600;
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.046em;
  cursor: pointer;
  background: ${colors.blackBtn};
  color: ${colors.softWhite};
  transition: background 0.15s ease;

  &:hover:not(:disabled) {
    background: #43404a;
  }
  &:disabled {
    opacity: 0.6;
    cursor: default;
  }
  &[data-ghost] {
    background: transparent;
    color: ${colors.text};
    border: 1px solid ${colors.lineStrong};
  }
  &[data-ghost]:hover:not(:disabled) {
    background: ${colors.media};
  }

  @media (hover: hover) {
    &[data-reveal] {
      display: none;
    }
  }
`

// The compact card's primary action (Figma): purple round Add to cart / Buy now.
const addRoundCss = compactRoundCss(addRoundFill)

// Add to cart / Buy now (Figma secondary dark button). Hidden at rest on hover-capable devices and
// revealed on card hover / body focus (see Card + Body); always shown where hover isn't available so
// items stay buyable without a mouse. z-index keeps it above the whole-card overlay link.
const cartCss = css`
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

export const AddRound = styled.button`
  ${addRoundCss};
`

export const Cart = styled.button`
  ${cartCss};
`

// The browse card's action when the item isn't for sale: VIEW takes Add-to-cart's place, so it gets the
// same hover reveal (via data-reveal) rather than the always-visible pill of a view-only card. Decorative
// — the whole-card overlay link navigates.
export const ViewCta = styled.span`
  ${cartCss};

  & .ico {
    width: 20px;
    height: 20px;
  }
`

// Anchor variants: an owned NAME's MANAGE controls point off-app (the Builder), so they need real
// links rather than buttons, with the identical treatment.
export const AddRoundLink = styled.a`
  ${addRoundCss};
`

export const CartLink = styled.a`
  ${cartCss};
`
