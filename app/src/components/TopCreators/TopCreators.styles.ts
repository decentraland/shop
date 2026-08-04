import styled from '@emotion/styled'
import { css } from '@emotion/react'
import { Link } from 'react-router-dom'
import { theme } from '~/styles/theme'

const { colors, radius, gradients, media } = theme

const AVATAR = 155
// The CTA's height plus the gap above it — the slot the panel reserves for it permanently (see Panel).
const CTA_SLOT = 56
// The hover ring: its thickness and the clear space it leaves around the panel. Both are what the
// Track reserves room for, since the ring is drawn OUTSIDE the panel's box.
const RING = 3
const RING_GAP = 6

export { Root, Head, Title, Dots, Dot } from '~/styles/row.styles'

// Four cards fill the row exactly at desktop widths, so there is nothing to scroll and no dots. Below
// the mobile breakpoint it becomes a one-card-per-page carousel with the next card peeking, which is
// what tells a thumb the row scrolls. `align-items: start` keeps every card measuring its own height.
//
// An overflow-x scroller clips overflow-y too, so the room for the hover ring is PADDING on all sides
// (the same dance styles/row.styles makes for the cards' outward glow); the matching negative margin
// then pulls the first card back into line with the section title.
export const Track = styled.div`
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: calc((100% - 48px) / 4);
  align-items: start;
  gap: 16px;
  overflow-x: auto;
  padding: ${RING + RING_GAP}px;
  margin-left: -${RING + RING_GAP}px;
  scroll-padding-inline: ${RING + RING_GAP}px;
  scroll-snap-type: x mandatory;
  scrollbar-width: none;
  -ms-overflow-style: none;

  &::-webkit-scrollbar {
    width: 0;
    height: 0;
    display: none;
  }
  & > * {
    scroll-snap-align: start;
  }

  /* Touch has no hover, so there is no ring to reserve room for: the card gets the full page gutter. */
  ${media.maxWidth('mobile')} {
    grid-auto-columns: 94%;
    padding: ${RING + RING_GAP}px 0;
    margin-left: 0;
    scroll-padding-inline: 0;
  }
`

// Everything on the card leads to the creator's storefront, so the card is ONE link and the name,
// blurb and CTA are inert markup on it — the pattern the ranking table used for its rows.
const cardBase = css`
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
`

export const Card = styled(Link)`
  ${cardBase};
`

export const SkeletonCard = styled.span`
  ${cardBase};
`

// Sits above the panel and covers the fill and the ring that run behind it. Same 155px at every width.
// The white ring is drawn outside the circle (box-shadow, not a border) so the snapshot keeps the full
// box.
export const Avatar = styled.span`
  position: relative;
  z-index: 1;
  display: block;
  flex: none;
  width: ${AVATAR}px;
  height: ${AVATAR}px;
  border-radius: 50%;
  box-shadow: 0 0 0 4px ${colors.white};
  overflow: hidden;

  & img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
`

/**
 * Starts at the avatar's centre, hence the negative margin and the matching top padding.
 *
 * The CTA's slot is part of the panel's box at ALL times, so no card ever changes height and nothing
 * below the row — the footer included — can move. What grows on hover is only what is PAINTED: the fill
 * (::before) and the hover ring (::after) are drawn by pseudo-elements whose bottom edge stops above the
 * empty slot while the card is idle and covers it when the CTA appears. (Handing the slot over on hover
 * instead is what made the footer twitch: the swap was instant while the CTA's own box animated, so for
 * the length of the transition the card was up to 56px short.)
 */
const fillBottom = (inset: number) => css`
  &::before {
    inset: 0 0 ${inset}px;
  }
  &::after {
    inset: -${RING + RING_GAP}px -${RING + RING_GAP}px ${inset - RING - RING_GAP}px;
  }
`

export const Panel = styled.span`
  position: relative;
  isolation: isolate;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  margin-top: -${AVATAR / 2}px;
  padding: ${AVATAR / 2 + 16}px 16px 16px;

  &::before,
  &::after {
    content: '';
    position: absolute;
    z-index: -1; /* isolate + negative z keeps both layers under the text instead of over it */
    transition:
      inset 0.15s ease,
      opacity 0.15s ease;
  }

  &::before {
    border-radius: ${radius.modal};
    background: ${colors.media};
  }

  /* The ring sits OUTSIDE the fill with clear space between the two, so the Track reserves room for it.
     Stroked with a mask rather than a border because a border cannot carry a gradient. */
  &::after {
    padding: ${RING}px;
    border-radius: calc(${radius.modal} + ${RING_GAP}px);
    background: ${gradients.amethyst};
    opacity: 0;
    -webkit-mask:
      linear-gradient(#000 0 0) content-box,
      linear-gradient(#000 0 0);
    mask:
      linear-gradient(#000 0 0) content-box,
      linear-gradient(#000 0 0);
    -webkit-mask-composite: xor;
    mask-composite: exclude;
  }

  ${fillBottom(CTA_SLOT)};

  [data-testid='top-creator-card']:hover &,
  [data-testid='top-creator-card']:focus-visible & {
    ${fillBottom(0)};

    &::after {
      opacity: 1;
    }
  }

  /* Nothing is ever hidden under a skeleton, so its box is the full one. */
  &[data-skeleton] {
    ${fillBottom(0)};
  }

  /* Touch has no hover: the CTA is out permanently, so the fill always covers it. */
  @media (hover: none) {
    ${fillBottom(0)};
  }
  ${media.maxWidth('mobile')} {
    ${fillBottom(0)};
  }
`

export const Name = styled.span`
  max-width: 100%;
  overflow: hidden;
  color: ${colors.text};
  font-size: 20px;
  font-weight: 600;
  line-height: 1.5;
  text-overflow: ellipsis;
  white-space: nowrap;
`

// Two lines, always: clamped so a long blurb can't make one card taller than its neighbours, and
// floored at the same two lines so a short one doesn't make it shorter.
export const Desc = styled.span`
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  min-height: 2.86em;
  margin-top: 4px;
  overflow: hidden;
  color: ${colors.text2};
  font-size: 16px;
  line-height: 1.43;
`

// Keeps its box whether it is showing or not (see Panel) and only fades — revealed by the CARD rather
// than by itself, since it is a label on the card's single link and has to appear for someone arriving
// by keyboard as well as by pointer.
export const Cta = styled.span`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 40px;
  margin-top: 16px;
  border-radius: ${radius.modal};
  background: ${colors.blackBtn};
  color: ${colors.softWhite};
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.46px;
  line-height: 1;
  text-transform: uppercase;
  white-space: nowrap;
  opacity: 0;
  transition: opacity 0.15s ease;

  [data-testid='top-creator-card']:hover &,
  [data-testid='top-creator-card']:focus-visible & {
    opacity: 1;
  }

  @media (hover: none) {
    opacity: 1;
  }
  ${media.maxWidth('mobile')} {
    opacity: 1;
  }
`

export const SkeletonName = styled.span`
  width: 60%;
  height: 20px;
`

export const SkeletonDesc = styled.span`
  width: 90%;
  height: 14px;
  margin-top: 8px;

  &[data-short] {
    width: 70%;
  }
`
