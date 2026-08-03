import styled from '@emotion/styled'
import { keyframes } from '@emotion/react'
import { theme } from '~/styles/theme'
import { CreatorBadge } from '~/components/CreatorBadge'
import { CurrencyIcon } from '~/components/CurrencyIcon'

const { colors, gradients, radius, media } = theme

const pulse = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.45; }
`

export const Creators = styled.section`
  margin: 0 0 48px;
`

export const Head = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
`

export const Title = styled.h2`
  margin: 0;
  color: ${colors.text};
  font-size: 20px;
  font-weight: 600;
  line-height: 1.6;
`

export const Period = styled.span`
  color: ${colors.text2};
  font-size: 14px;
  font-weight: 600;
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
  width: 100%;
  min-width: 640px;

  /* 640 is a desktop floor. Lowering it on mobile is what lets a fourth column reach the screen instead of
     leaving three visible and two behind a scroll nobody knew was there. */
  ${media.maxWidth('mobile')} {
    min-width: 460px;
  }
  border-collapse: separate;
  border-spacing: 0 8px; /* vertical gap between rows */
`

// Gradient header bar — one continuous amethyst band with rounded ends.
export const Th = styled.th`
  background: ${gradients.amethyst};
  color: ${colors.white};
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 1px;
  text-transform: uppercase;
  text-align: left;
  white-space: nowrap;
  padding: 12px 24px;

  &:first-child {
    border-radius: 8px 0 0 8px;
  }
  &:last-child {
    border-radius: 0 8px 8px 0;
  }
  &[data-rank] {
    text-align: center;
  }
  &[data-num] {
    text-align: right;
  }

  ${media.maxWidth('mobile')} {
    padding: 10px 8px;
  }
`

// Rows — subtle translucent panel like the Figma "Info Row"; styling lives on the cells.
export const Row = styled.tr`
  & td {
    background: rgba(245, 245, 245, 0.8);
    padding: 12px 24px;
    vertical-align: middle;
    height: 64px;
  }
  & td:first-child {
    border-radius: 8px 0 0 8px;
  }
  & td:last-child {
    border-radius: 0 8px 8px 0;
  }

  ${media.maxWidth('mobile')} {
    & td {
      padding: 10px 8px;
    }
  }
`

export const RankCell = styled.td`
  text-align: center;
  width: 96px;

  /* 96px of rank is a quarter of a phone's width for a single digit. */
  ${media.maxWidth('mobile')} {
    width: 52px;
  }
`

// Magenta rounded rank badge (1, 2, 3…).
export const Rank = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 48px;
  height: 40px;
  padding: 0 14px;
  border-radius: ${radius.btn};
  background: ${gradients.amethyst};
  color: ${colors.white};
  font-size: 18px;
  font-weight: 500;
  line-height: 1;

  &[data-skeleton] {
    background: #d9d6de;
    animation: ${pulse} 1.2s ease-in-out infinite;
  }
`

export const CreatorCell = styled.td`
  min-width: 200px;

  /**
   * The 200px floor is a DESKTOP floor. On a phone it is more than half the viewport before padding, so the
   * table gave this column ~232px of a 375px row and squeezed the rank and the numbers into what was left —
   * which is how the row became unreadable. Capped instead, and the name ellipsises rather than pushing.
   */
  ${media.maxWidth('mobile')} {
    min-width: 0;
    max-width: 132px;
    overflow: hidden;
  }
`

// CreatorBadge renders "By {name}" — bump it to the 16px table size + magenta name (Figma creator cell).
export const Creator = styled(CreatorBadge)`
  font-size: 16px;

  & [data-avatar] {
    width: 32px;
    height: 32px;
  }
  & [data-testid='creator-name'] {
    color: ${colors.accent};
    font-weight: 600;
  }

  /* The badge is a flex row, so the name needs min-width: 0 before it will shrink — without it the text keeps
     its intrinsic width and the cap on the cell above just clips instead of ellipsising. */
  ${media.maxWidth('mobile')} {
    min-width: 0;

    & [data-testid='creator-name'] {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      min-width: 0;
    }
  }
  &[data-link]:hover [data-testid='creator-name'] {
    color: ${colors.accent};
  }
`

export const Num = styled.td`
  text-align: right;
  color: ${colors.text};
  font-size: 16px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;

  &[data-volume] {
    white-space: nowrap;
  }
`

export const Coin = styled(CurrencyIcon)`
  width: 16px;
  height: 16px;
  margin-right: 6px;
  vertical-align: -2px;
  background-color: ${colors.text};
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
`
