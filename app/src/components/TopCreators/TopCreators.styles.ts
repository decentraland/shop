import styled from '@emotion/styled'
import { css } from '@emotion/react'
import { Link } from 'react-router-dom'
import { theme } from '~/styles/theme'

const { colors, radius, media } = theme

const AVATAR = 112
const AVATAR_MOBILE = 152
// The CTA's height plus the gap above it — the slot the panel reserves for it permanently (see Panel).
const CTA_SLOT = 56

export { Root, Head, Title, Dots, Dot } from '~/styles/row.styles'

// Four cards fill the row exactly at desktop widths, so there is nothing to scroll and no dots. Below
// the mobile breakpoint it becomes a one-card-per-page carousel with the next card peeking, which is
// what tells a thumb the row scrolls. `align-items: start` keeps every card measuring its own height.
export const Track = styled.div`
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: calc((100% - 48px) / 4);
  align-items: start;
  gap: 16px;
  overflow-x: auto;
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

  ${media.maxWidth('mobile')} {
    grid-auto-columns: 86%;
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

// Sits above the panel and covers the border that runs behind it. The white ring is drawn outside the
// circle (box-shadow, not a border) so the snapshot keeps the full 112px box.
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

  ${media.maxWidth('mobile')} {
    width: ${AVATAR_MOBILE}px;
    height: ${AVATAR_MOBILE}px;
  }
`

/**
 * Starts at the avatar's centre, hence the negative margin and the matching top padding.
 *
 * The CTA's slot is part of the panel's box at ALL times, so no card ever changes height and nothing
 * below the row — the footer included — can move. What grows on hover is only the PAINTED box: the
 * fill and the border are drawn by a pseudo-element whose bottom edge stops above the empty slot while
 * the card is idle and covers it when the CTA appears. (Handing the slot over on hover instead is what
 * made the footer twitch: the swap was instant while the CTA's own box animated, so for the length of
 * the transition the card was up to 56px short.)
 */
export const Panel = styled.span`
  position: relative;
  isolation: isolate;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  margin-top: -${AVATAR / 2}px;
  padding: ${AVATAR / 2 + 16}px 16px 16px;

  &::before {
    content: '';
    position: absolute;
    inset: 0 0 ${CTA_SLOT}px;
    z-index: -1; /* isolate + negative z keeps the fill under the text instead of over it */
    border: 2px solid transparent;
    border-radius: ${radius.modal};
    background: ${colors.media};
    transition:
      inset 0.15s ease,
      border-color 0.15s ease;
  }

  [data-testid='top-creator-card']:hover &::before,
  [data-testid='top-creator-card']:focus-visible &::before {
    inset: 0;
    border-color: ${colors.accent};
  }

  /* Nothing is ever hidden under a skeleton, so its box is the full one. */
  &[data-skeleton]::before {
    inset: 0;
  }

  /* Touch has no hover: the CTA is out permanently, so the box always covers it. */
  @media (hover: none) {
    &::before {
      inset: 0;
    }
  }
  ${media.maxWidth('mobile')} {
    &::before {
      inset: 0;
    }
  }

  ${media.maxWidth('mobile')} {
    margin-top: -${AVATAR_MOBILE / 2}px;
    padding-top: ${AVATAR_MOBILE / 2 + 16}px;
  }
`

export const Name = styled.span`
  max-width: 100%;
  overflow: hidden;
  color: ${colors.text};
  font-size: 16px;
  font-weight: 700;
  line-height: 1.5;
  text-overflow: ellipsis;
  white-space: nowrap;

  ${media.maxWidth('mobile')} {
    font-size: 18px;
  }
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
  font-size: 14px;
  line-height: 1.43;

  ${media.maxWidth('mobile')} {
    font-size: 15px;
  }
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
  border-radius: ${radius.pill};
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
