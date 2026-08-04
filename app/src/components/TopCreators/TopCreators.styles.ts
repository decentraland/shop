import styled from '@emotion/styled'
import { css } from '@emotion/react'
import { Link } from 'react-router-dom'
import { theme } from '~/styles/theme'

const { colors, radius, media } = theme

const AVATAR = 112
const AVATAR_MOBILE = 152
// The CTA's height plus the gap above it: what the panel grows by when it appears, and what an idle
// card holds in reserve underneath itself so that growth never moves the row.
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
  padding-bottom: ${CTA_SLOT}px;
`

export const Card = styled(Link)`
  ${cardBase};

  /* The reserve is handed to the CTA, so the card's total height is the same hovered or not. */
  &:hover,
  &:focus-visible {
    padding-bottom: 0;
  }

  /* Touch has no hover: the CTA is out permanently, and nothing is held back for it. */
  @media (hover: none) {
    padding-bottom: 0;
  }
  ${media.maxWidth('mobile')} {
    padding-bottom: 0;
  }
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

// Starts at the avatar's centre, hence the negative margin and the matching top padding.
export const Panel = styled.span`
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  margin-top: -${AVATAR / 2}px;
  padding: ${AVATAR / 2 + 16}px 16px 16px;
  border: 2px solid transparent;
  border-radius: ${radius.modal};
  background: ${colors.media};

  [data-testid='top-creator-card']:hover &,
  [data-testid='top-creator-card']:focus-visible & {
    border-color: ${colors.accent};
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

// Revealed by the CARD, not by itself — it is a label on the card's single link, so it has to appear
// for someone arriving by keyboard as well as by pointer.
const ctaShown = css`
  height: 40px;
  margin-top: 16px;
  opacity: 1;
`

export const Cta = styled.span`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 0;
  margin-top: 0;
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
  overflow: hidden;
  transition:
    height 0.15s ease,
    margin-top 0.15s ease,
    opacity 0.15s ease;

  [data-testid='top-creator-card']:hover &,
  [data-testid='top-creator-card']:focus-visible & {
    ${ctaShown};
  }

  @media (hover: none) {
    ${ctaShown};
  }
  ${media.maxWidth('mobile')} {
    ${ctaShown};
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
