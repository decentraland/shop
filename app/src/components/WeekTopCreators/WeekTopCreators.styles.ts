import styled from '@emotion/styled'
import { keyframes } from '@emotion/react'
import { theme } from '~/styles/theme'
import { CreatorBadge } from '~/components/CreatorBadge'
import { CurrencyIcon } from '~/components/CurrencyIcon'

const { colors, radius, media } = theme

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
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
`

// Figma section header: Inter Semi Bold 20 / 1.5, true white.
export const Title = styled.h2`
  margin: 0;
  color: ${colors.softWhite};
  font-size: 20px;
  font-weight: 600;
  line-height: 1.5;
`

export const Period = styled.span`
  color: ${colors.gray4};
  font-size: 14px;
  font-weight: 600;
`

// Horizontal scroll on narrow screens so the table never forces the page to scroll sideways.
export const Scroll = styled.div`
  overflow-x: auto;
`

export const Table = styled.table`
  width: 100%;
  min-width: 640px;
  border-collapse: separate;
  border-spacing: 0 8px; /* vertical gap between rows */
`

// Header bar — one continuous flat-violet band with rounded ends (Figma dark theme).
export const Th = styled.th`
  background: ${colors.brandViolet};
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
    padding: 10px 16px;
  }
`

// Rows — deep-purple panels (Figma dark theme); styling lives on the cells.
export const Row = styled.tr`
  & td {
    background: #50196c;
    color: ${colors.softWhite};
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
      padding: 10px 16px;
    }
  }
`

export const RankCell = styled.td`
  text-align: center;
  width: 96px;
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
  background: ${colors.brandViolet};
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
`

// CreatorBadge renders "By {name}" — bump it to the 16px table size + magenta name (Figma creator cell).
export const Creator = styled(CreatorBadge)`
  font-size: 16px;

  & [data-avatar] {
    width: 32px;
    height: 32px;
  }
  & [data-testid='creator-name'] {
    color: #ff7439;
    font-weight: 600;
  }
  &[data-link]:hover [data-testid='creator-name'] {
    color: #ff7439;
  }
`

export const Num = styled.td`
  text-align: right;
  color: ${colors.softWhite};
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
  background-color: ${colors.softWhite};
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
