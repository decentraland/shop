import styled from '@emotion/styled'
import { Link } from 'react-router-dom'
import { Button } from '~/components/Button'
import { Icon } from '~/components/Icon'
import { ringGradient, ringHairline, ringLit } from '~/styles/card.styles'
import { Chip } from '~/styles/chip.styles'
import { theme } from '~/styles/theme'

const { colors, radius, media } = theme

export const Root = styled.div`
  max-width: 1721px;
  margin: 0 auto;
`

export const Crumbs = styled.nav`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: ${colors.muted};
  margin-bottom: 18px;
`

export const Crumb = styled(Link)`
  color: ${colors.muted};

  &:hover {
    color: ${colors.text};
  }
`

export const CrumbCurrent = styled.span`
  color: ${colors.text};
  font-weight: 600;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
`

// Desktop fills the viewport below the chrome (fixed navbar + subnav ≈ 136px, page top padding
// 28px, crumbs ≈ 52px, ~24px of breathing): the interaction never scrolls the page — the item list
// scrolls, and the CTA stays pinned to the preview's bottom edge. Phones stack and scroll
// normally, with the CTA bar fixed instead.
export const Main = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 7fr) minmax(0, 5fr);
  gap: 40px;
  align-items: stretch;
  height: calc(100dvh - 240px);
  min-height: 520px;

  ${media.maxWidth('mobile')} {
    grid-template-columns: 1fr;
    gap: 16px;
    height: auto;
    min-height: 0;
  }
`

export const Preview = styled.div`
  position: relative;
  border-radius: 24px;
  overflow: hidden;
  background: ${colors.media};

  ${media.maxWidth('mobile')} {
    aspect-ratio: 1 / 1;
  }

  & iframe {
    width: 100%;
    height: 100%;
    border: 0;
    display: block;
  }

  [data-preview-viewport] {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
`

// The uploaded artwork is a transparent-background portrait; contain floats the whole look on the
// radial gradient instead of cover's brutal crop in the wide desktop panel.
// ui2's <EmoteControls> lays its own bar out absolutely against the nearest positioned ancestor and
// is already styled for a dark backdrop — which the outfit gradient provides — so this wrapper only
// anchors it and keeps drag-to-rotate working on the canvas underneath.
export const EmoteControls = styled.div`
  position: absolute;
  inset: 0;
  pointer-events: none;

  & [class*="MuiBox"] {
    pointer-events: auto;
  }
`

export const PreviewFallback = styled.img`
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
`

export const Info = styled.div`
  display: flex;
  flex-direction: column;
  gap: 15px;
  min-height: 0;
`

export const Title = styled.h1`
  font-size: 28px;
  font-weight: 600;
  overflow-wrap: anywhere;
`

export const Meta = styled.p`
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: ${colors.muted1};
`

// The only scroll container on the desktop page. Shrinkable but NOT growing (flex 0 1 auto): a
// short list keeps the CTA right at its end instead of parking it at the column's bottom; a long
// one shrinks to the available space and scrolls. min-height: 0 is what lets a flex child shrink
// below its content.
export const ListScroll = styled.div`
  flex: 0 1 auto;
  min-height: 0;
  overflow-y: auto;
  /* Breathing room INSIDE the scroller (with the matching negative margin re-aligning the cards):
     the hover zoom + ring + glow would otherwise be cropped by the overflow clip. */
  padding: 8px 10px;
  margin: -8px -10px;

  ${media.maxWidth('mobile')} {
    overflow: visible;
    padding: 0;
    margin: 0;
  }
`

export const Items = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
`

// A white card per item: square thumb on a soft panel, name + author + price beside it. The whole
// card is one link to the item (the absolutely-positioned overlay), with the author link layered
// above it — nesting <a> inside <a> is invalid, so the card link is a sibling, not a wrapper.
// The border is the AssetCard ring, but eased: the hairline (::after) stays put while the cerise
// gradient lives on its own layer (::before) that FADES in over the slight zoom, so the stroke and
// glow feel like they grow out of the card instead of snapping on.
export const ItemCard = styled.li`
  position: relative;
  display: flex;
  align-items: stretch;
  gap: 14px;
  border-radius: 16px;
  background: ${colors.bg};
  overflow: hidden;
  isolation: isolate;
  transition:
    box-shadow 0.35s ease,
    transform 0.25s ease;

  &::after {
    ${ringHairline};
  }

  &::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: 5;
    pointer-events: none;
    border-radius: inherit;
    ${ringGradient};
    opacity: 0;
    transition: opacity 0.3s ease;
  }

  @media (hover: hover) {
    &:hover,
    &:focus-within {
      ${ringLit};
      transform: scale(1.015);
      /* Above the neighbouring rows while zoomed, or the next card paints over the growth. */
      z-index: 6;
    }
    &:hover::before,
    &:focus-within::before {
      opacity: 1;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;

    &:hover,
    &:focus-within {
      transform: none;
    }
    &::before {
      transition: none;
    }
  }

  &[data-state='unavailable'],
  &[data-state='missing'] {
    opacity: 0.55;
  }
`

export const ItemOverlayLink = styled(Link)`
  position: absolute;
  inset: 0;
  z-index: 1;
`

export const ItemThumb = styled.img`
  width: 96px;
  height: 96px;
  object-fit: cover;
  background: ${colors.panel};
  flex-shrink: 0;

  ${media.maxWidth('mobile')} {
    width: 88px;
    height: 88px;
  }
`

export const ItemThumbEmpty = styled.span`
  width: 96px;
  height: 96px;
  background: ${colors.panel};
  flex-shrink: 0;

  ${media.maxWidth('mobile')} {
    width: 88px;
    height: 88px;
  }
`

export const ItemBody = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 3px;
  padding: 10px 14px 10px 0;
`

export const ItemName = styled.span`
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`

// Above the card's overlay link so it wins the click; navigation handled as a real link.
export const ItemAuthor = styled(Link)`
  position: relative;
  z-index: 2;
  align-self: flex-start;
  font-size: 13px;
  color: ${colors.muted};

  &:hover {
    color: ${colors.text};
    text-decoration: underline;
  }
`

export const ItemPriceRow = styled.span`
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 2px;
`

export const ItemPrice = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 16px;
  font-weight: 600;
  white-space: nowrap;
`

export const ItemBadge = styled.span`
  font-size: 12px;
  font-weight: 400;
  padding: 2px 8px;
  border-radius: ${radius.chip};
  background: ${colors.chip};
  color: ${colors.text2};
  white-space: nowrap;
`

// The AssetCard attribute chips (rarity / smart / category / gender), right-aligned in the price
// row. Dropped on phones like the browse cards — the row hasn't the room.
export const AttrChips = styled.span`
  display: flex;
  align-items: center;
  gap: 3px;
  margin-left: auto;

  ${media.maxWidth('mobile')} {
    display: none;
  }
`

export const AttrChip = styled(Chip)`
  &[data-variant='smart'] {
    gap: 2px;
    background: ${colors.chip};
    color: ${colors.text2};
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }
`

export const Hint = styled.p`
  margin-top: 8px;
`

export const ResolveError = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
  padding: 8px 0;
`

export const CtaBar = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-top: 12px;
  border-top: 1px solid ${colors.line};

  ${media.maxWidth('mobile')} {
    /* Sticky, not fixed: it rides the viewport bottom while the list is longer than the screen,
       then STOPS at the list's end (its natural place as the column's last child) when the user
       scrolls on toward the footer. Negative margin restores the full-bleed bar inside the page's
       16px gutter. */
    position: sticky;
    bottom: 0;
    z-index: 5;
    margin: 40px -16px 0;
    padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
    border-top: 0;
    background: ${colors.softWhite};
    box-shadow: 0 -4px 16px rgba(22, 21, 24, 0.12);
  }
`

export const TotalRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;

  ${media.maxWidth('mobile')} {
    /* The phone CTA carries the price itself (the Figma bar). */
    display: none;
  }
`

export const TotalLabel = styled.span`
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: ${colors.muted1};
`

export const TotalValue = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 26px;
  font-weight: 800;
`

export const Cta = styled(Button)`
  width: 100%;
  min-height: 52px;
  border-radius: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
`

export const CtaPrice = styled.span`
  display: none;

  ${media.maxWidth('mobile')} {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 16px;
  }
`

export const Empty = styled.div`
  min-height: 52vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 14px;
`

export const EmptyIco = styled(Icon)`
  opacity: 0.4;
`

export const EmptyTitle = styled.h1`
  font-size: 24px;
`
