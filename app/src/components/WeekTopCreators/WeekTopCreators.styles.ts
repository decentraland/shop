import styled from '@emotion/styled'
import { css, keyframes } from '@emotion/react'
import { Link } from 'react-router-dom'
import { theme } from '~/styles/theme'
import { CreatorBadge } from '~/components/CreatorBadge'

const { colors, radius, media } = theme

// The design's row fill sits between the theme's panel (#f5f5f5) and media (#ecebed) and is neither,
// so it is spelled out here rather than bent onto a token that means something else. The HOVER fill
// IS colors.media, so that one comes from the theme.
const rowFill = '#efefef'

const pulse = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.45; }
`

export const Creators = styled.section`
  margin: 0 0 50px;
`

export const Head = styled.div`
  display: flex;
  align-items: baseline;
  /* 12, not the 20px of styles/row.styles: border-spacing below already puts 8px above the header
     band, so 12 + 8 is what keeps this section's heading gap equal to every other Overview section. */
  margin-bottom: 12px;
`

/**
 * Kept at the shared Overview section-heading size (see styles/row.styles Title), NOT at the 20px the
 * Figma frame draws: that frame is a component-level view of the table, while every section heading on
 * this page is the 50px display style. Matching the frame here would single this section out.
 */
export const Title = styled.h2`
  margin: 0;
  color: ${colors.text};
  font-size: 50px;
  font-weight: 900;
  letter-spacing: -0.05em;
  line-height: 1.1;

  ${media.maxWidth('mobile')} {
    font-size: 32px;
  }
`

// Horizontal scroll on narrow screens so the table never forces the page to scroll sideways.
export const Scroll = styled.div`
  overflow-x: auto;

  /**
   * Fade the right edge while there is more table to reach.
   *
   * Five columns do not fit a phone, so this scrolls — by design. What made it read as broken rather than as
   * scrollable was the absence of any hint: the header was cut mid-word ("COLLECTION|S") against a hard edge,
   * with the scrollbar hidden on touch. The same mask is what the browse tab strip uses for the same reason.
   */
  ${media.maxWidth('mobile')} {
    mask-image: linear-gradient(to right, #000 0, #000 calc(100% - 24px), transparent 100%);
    -webkit-mask-image: linear-gradient(to right, #000 0, #000 calc(100% - 24px), transparent 100%);
  }
`

export const Table = styled.table`
  /* The rank column: the design's 59px rank chip plus the 16px gap it leaves before the row card. The
     ring below and the chip both measure off this, so it lives in one place. */
  --rank-col: 75px;

  width: 100%;
  border-collapse: separate;
  /* The design's 8px gap between rows. It also lands above the header band and below the last row,
     which is what the header and section spacing are trimmed for. */
  border-spacing: 0 8px;

  /**
   * 820 is what the desktop design needs end to end: the rank column, three equal columns whose widest
   * content is the collections cell (three 40px thumbnails + the overflow chip + padding), and the
   * amount column that has to hold the hover CTA. It replaces the old 640 floor, which predates the
   * artwork column. Below it the table scrolls rather than crushing a column.
   */
  min-width: 820px;

  ${media.minWidth('mobile')} {
    /* Fixed layout is what makes the three middle columns exactly equal, as the design draws them:
       with the rank and amount widths pinned, the rest is split evenly regardless of content. */
    table-layout: fixed;
  }

  ${media.maxWidth('mobile')} {
    --rank-col: 52px;

    /* 820 is a desktop floor. Lowering it on mobile is what lets a fourth column reach the screen
       instead of leaving three visible and two behind a scroll nobody knew was there. Intrinsic (auto)
       layout stays on below this width, because it is what lets the creator-name cap actually shrink. */
    min-width: 460px;
  }
`

// Header labels. The violet is drawn by a pseudo-element rather than by the cell background, because
// the design's header is TWO pills — a rank chip, then one continuous band over the four data columns —
// and because the cell has to reserve 8px of clear space underneath that the band must not paint.
export const Th = styled.th`
  position: relative;
  isolation: isolate;
  height: 48px; /* the design's 40px band + the 8px that, with border-spacing, makes its 16px gap */
  padding: 0 0 8px 24px;
  color: ${colors.white};
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 1px;
  line-height: 1;
  text-align: left;
  text-transform: uppercase;
  vertical-align: middle;
  white-space: nowrap;

  &::before {
    content: '';
    position: absolute;
    inset: 0 0 8px;
    z-index: -1; /* isolate + negative z keeps the band under the label instead of over it */
    background: ${colors.brandViolet};
  }
  /* The band's rounded ends: it starts at the creator column, not at the rank chip. */
  &[data-creator]::before {
    border-radius: ${radius.btn} 0 0 ${radius.btn};
  }
  &[data-amount]::before {
    border-radius: 0 ${radius.btn} ${radius.btn} 0;
  }

  /* The rank label is its own detached pill, so its band stops short of the gap and rounds all four
     corners. The right padding is what centres the label on the pill rather than on the column. */
  &[data-rank] {
    width: var(--rank-col);
    padding: 0 16px 8px 0;
    text-align: center;
  }
  &[data-rank]::before {
    right: 16px;
    border-radius: ${radius.btn};
  }

  &[data-center] {
    text-align: center;
  }
  /* Aligned with the amount itself (16px), not with the 24px the creator label uses. */
  &[data-amount] {
    padding-left: 16px;
  }

  ${media.minWidth('mobile')} {
    /* 340 of the design's 1609px table — a share, not a fixed width, so the columns keep the design's
       proportions at any container width. */
    &[data-amount] {
      width: 21.1%;
    }
  }

  ${media.maxWidth('mobile')} {
    padding: 0 8px 8px;

    &[data-rank] {
      padding: 0 8px 8px 0;
    }
  }
`

export const Row = styled.tr`
  position: relative; /* containing block for the whole-row link and the hover ring */

  & td {
    background: ${rowFill};
    height: 56px;
    padding: 0 8px 0 16px;
    vertical-align: middle;
  }
  & td:nth-of-type(2) {
    border-radius: ${radius.btn} 0 0 ${radius.btn};
  }
  & td:last-of-type {
    border-radius: 0 ${radius.btn} ${radius.btn} 0;
  }

  &:hover td,
  &:focus-within td {
    background: ${colors.media};
  }
  /* The rank chip is detached from the card, so its cell never takes the card fill. */
  & td:first-of-type,
  &:hover td:first-of-type,
  &:focus-within td:first-of-type {
    background: none;
  }

  /**
   * The hover/focus ring: a 3px gradient frame around the row card only.
   *
   * It is masked out in the middle instead of being an outset border or an outer glow, because the
   * table sits in a horizontal scroller — anything drawn outside the table box is either clipped by it
   * or adds phantom scroll to it. That is also why the design's 8px violet drop shadow is dropped.
   */
  &::before {
    content: '';
    position: absolute;
    inset: 0 0 0 var(--rank-col);
    padding: 3px;
    border-radius: ${radius.btn};
    background: linear-gradient(180deg, ${colors.dclRed} 0%, ${colors.magenta} 100%);
    -webkit-mask:
      linear-gradient(#000 0 0) content-box,
      linear-gradient(#000 0 0);
    mask:
      linear-gradient(#000 0 0) content-box,
      linear-gradient(#000 0 0);
    -webkit-mask-composite: xor;
    mask-composite: exclude;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.15s ease;
  }
  &:hover::before,
  &:focus-within::before {
    opacity: 1;
  }

  ${media.maxWidth('mobile')} {
    & td {
      padding: 0 8px;
    }
  }
`

/**
 * The row's navigation, as a SINGLE link overlaid on the whole row — the same pattern AssetCard uses
 * for whole-card navigation. The row, the creator and the "view collections" pill all lead to one
 * place, so making them separate controls would be three tab stops to the same URL; instead the cells
 * stay plain text and this carries the accessible name.
 *
 * It has no focus outline of its own because the row's ring + fill already answer :focus-within, and a
 * second outline around the rank chip on top of that reads as two overlapping widgets.
 */
export const RowLink = styled(Link)`
  position: absolute;
  inset: 0;
  z-index: 1;

  &:focus-visible {
    outline: none;
  }
`

export const RankCell = styled.td`
  width: var(--rank-col);
  padding: 0;
  text-align: left;
`

// The violet rank chip (1, 2, 3…). 59px of a 75px column, so the gap falls to its right.
export const Rank = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 59px;
  height: 56px;
  border-radius: ${radius.btn};
  background: ${colors.brandViolet};
  color: ${colors.white};
  font-size: 20px;
  font-weight: 500;
  line-height: 1.6;

  &[data-skeleton] {
    background: #d9d6de;
    animation: ${pulse} 1.2s ease-in-out infinite;
  }

  ${media.maxWidth('mobile')} {
    width: 44px;
    font-size: 16px;
  }
`

export const CreatorCell = styled.td`
  /**
   * On a phone this column is more than half the viewport before padding, so the table gave it ~232px
   * of a 375px row and squeezed the rank and the numbers into what was left — which is how the row
   * became unreadable. Capped instead, and the name ellipsises rather than pushing. (Above the mobile
   * breakpoint the table is table-layout: fixed, so the column width comes from the header cell.)
   */
  ${media.maxWidth('mobile')} {
    max-width: 132px;
    overflow: hidden;
  }
`

// CreatorBadge renders avatar + name — bump it to the design's 40px avatar, 10px gap and 16px purple
// name. It is rendered without linkToProfile, so it is inert markup under the row's own link.
export const Creator = styled(CreatorBadge)`
  gap: 10px;
  font-size: 16px;

  & [data-avatar] {
    width: 40px;
    height: 40px;
    /* The design's 3px translucent ring. An inset outline draws it over the snapshot without eating
       into the 40px box the way a border would. */
    outline: 3px solid rgba(255, 255, 255, 0.5);
    outline-offset: -3px;
  }
  & [data-testid='creator-name'] {
    color: ${colors.accent};
    font-size: 16px;
    font-weight: 600;
    line-height: 1.43;
  }

  ${media.maxWidth('mobile')} {
    /* The badge is a flex row, so the name needs min-width: 0 before it will shrink — without it the text
       keeps its intrinsic width and the cap on the cell above just clips instead of ellipsising. */
    min-width: 0;

    & [data-avatar] {
      width: 32px;
      height: 32px;
    }
    & [data-testid='creator-name'] {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      min-width: 0;
    }
  }
`

export const CollectionsCell = styled.td`
  text-align: center;
`

// Up to three pieces of collection artwork plus an overflow chip, centred in the column.
export const Thumbs = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;

  /* 178px of artwork is half a phone row. The count below stands in for it there — the whole row is
     the tap target, so nothing is lost but the preview. */
  ${media.maxWidth('mobile')} {
    display: none;
  }
`

const tile = css`
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 40px;
  height: 40px;
  border-radius: ${radius.chip};
  background: ${colors.white};
  /* The design draws a 0.25px Gray 3 stroke; cardLine is this project's rendering of exactly that. */
  border: 1px solid ${colors.cardLine};
`

export const Thumb = styled.span`
  ${tile};
  overflow: hidden;

  & img {
    width: 40px;
    height: 40px;
    object-fit: cover;
  }
`

// "+N": the collections we have no artwork for. Same box as a thumbnail.
export const More = styled.span`
  ${tile};
  color: ${colors.text2};
  font-size: 16px;
  font-weight: 600;
  line-height: 1.5;
`

// The mobile stand-in for the artwork: the plain collection count, as this column showed before.
export const Count = styled.span`
  display: none;
  color: ${colors.text2};
  font-size: 16px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;

  ${media.maxWidth('mobile')} {
    display: inline;
  }
`

export const Num = styled.td`
  text-align: center;
  color: ${colors.text2};
  font-size: 16px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
`

export const AmountCell = styled.td`
  padding: 0 16px;
`

// The amount sits left and the CTA right, with the CTA's slot reserved whether or not it is showing —
// which is what keeps the amount in the same place on every row, hovered or not.
export const AmountRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
`

export const Amount = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: ${colors.text2};
  font-size: 16px;
  font-weight: 600;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
`

export const Cta = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  height: 40px;
  padding: 0 12px;
  border-radius: ${radius.card};
  background: ${colors.accent};
  color: ${colors.softWhite};
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.46px;
  line-height: 24px;
  text-transform: uppercase;
  white-space: nowrap;
  opacity: 0;
  transition: opacity 0.15s ease;

  /* Revealed by the ROW, not by itself: it is a label on the row's single link, so it has to appear for
     someone arriving by keyboard as well as by pointer. */
  tr:hover &,
  tr:focus-within & {
    opacity: 1;
  }

  /* There is no hover on touch, and 161px of button does not fit a phone row. */
  ${media.maxWidth('mobile')} {
    display: none;
  }
`

export const Skeleton = styled.span`
  display: inline-block;
  width: 40px;
  height: 14px;
  border-radius: 6px;
  background: #d9d6de;
  animation: ${pulse} 1.2s ease-in-out infinite;

  &[data-creator] {
    width: 140px;
    height: 20px;
  }
  &[data-thumb] {
    width: 40px;
    height: 40px;
    border-radius: ${radius.chip};
  }
`
