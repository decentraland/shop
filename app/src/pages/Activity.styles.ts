import styled from '@emotion/styled'
import { keyframes } from '@emotion/react'
import { theme } from '~/styles/theme'
import { Button } from '~/components/Button'

// Activity — a chronological feed of the signed-in user's shop actions (purchases + secondary sales),
// with type filters. Purchases render as ORDER cards (one card per checkout: header with date, status,
// total in credits + its line items); sales render as a matching card (date, "Sold" pill, +amount +
// the sold item). Styled to match the shop's rounded white cards, hairline borders, and violet accent;
// borrows the AssetCard/list vocabulary already used across the app.

const shimmer = keyframes`
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
`

export const Section = styled.section`
  width: 100%;
  min-width: 0;
`

export const Head = styled.div`
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 20px;
`

export const Title = styled.h1`
  font-family: ${theme.font.sans};
  margin: 0;
`

export const Count = styled.span`
  color: ${theme.colors.muted};
  font-size: 14px;
`

// Type filters (All / Purchases / Sales). Segmented pill row; the active tab is selected via
// `data-active` so no style-only prop reaches the DOM.
export const Tabs = styled.div`
  display: flex;
  gap: 8px;
  margin-bottom: 20px;
  flex-wrap: wrap;
`

export const Tab = styled.button`
  appearance: none;
  border: 1px solid ${theme.colors.line};
  background: ${theme.colors.white};
  color: ${theme.colors.text};
  font-family: ${theme.font.sans};
  font-size: 14px;
  font-weight: 600;
  padding: 8px 16px;
  min-height: 40px;
  border-radius: ${theme.radius.pill};
  cursor: pointer;
  transition:
    background 0.15s,
    border-color 0.15s,
    color 0.15s;

  &:hover {
    background: ${theme.colors.media};
  }
  &:focus-visible {
    outline: 2px solid ${theme.colors.accent};
    outline-offset: 2px;
  }
  &[data-active='true'] {
    background: ${theme.colors.accent};
    border-color: ${theme.colors.accent};
    color: ${theme.colors.white};
  }
`

export const List = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 760px;
`

// One checkout.
export const Card = styled.div`
  background: ${theme.colors.white};
  border: 1px solid ${theme.colors.line};
  border-radius: 16px;
  overflow: hidden;
`

export const CardHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 18px;
  background: ${theme.colors.softWhite};
  border-bottom: 1px solid ${theme.colors.line};

  ${theme.media.down('mobile')} {
    flex-wrap: wrap;
  }
`

export const HeadLeft = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
`

export const DateText = styled.span`
  font-weight: 700;
  color: ${theme.colors.text};
`

export const SubCount = styled.span`
  font-size: 13px;
  color: ${theme.colors.muted};
`

export const HeadRight = styled.div`
  display: flex;
  align-items: center;
  gap: 14px;
`

// Status pill. `data-status` selects the palette so no style-only prop reaches the DOM.
export const Pill = styled.span`
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  padding: 4px 10px;
  border-radius: ${theme.radius.pill};
  white-space: nowrap;

  &[data-status='SETTLED'] {
    background: rgba(30, 166, 114, 0.14);
    color: ${theme.colors.okStrong};
  }
  &[data-status='PENDING'] {
    background: rgba(245, 166, 35, 0.16);
    color: #b5790a;
  }
  &[data-status='SOLD'] {
    background: rgba(103, 58, 183, 0.14);
    color: ${theme.colors.accent};
  }
`

export const Total = styled.div`
  display: flex;
  align-items: center;
  gap: 5px;
  font-weight: 800;
  color: ${theme.colors.text};
  white-space: nowrap;

  .ccy-mark {
    width: 16px;
    height: 16px;
  }

  // Money received (a sale) reads as income in the shop's success green.
  &[data-kind='income'] {
    color: ${theme.colors.okStrong};
  }
`

export const Lines = styled.div`
  display: flex;
  flex-direction: column;
`

// A line item. Rendered as a router <Link> when the item detail resolves, else a plain <div>.
export const Line = styled.div`
  display: grid;
  grid-template-columns: 52px 1fr auto;
  align-items: center;
  gap: 14px;
  padding: 12px 18px;
  text-decoration: none;
  color: inherit;

  & + & {
    border-top: 1px solid ${theme.colors.line};
  }

  &[data-link='true'] {
    transition: background 0.15s;
  }
  &[data-link='true']:hover {
    background: ${theme.colors.media};
  }
  &[data-link='true']:focus-visible {
    outline: 2px solid ${theme.colors.accent};
    outline-offset: -2px;
  }
`

export const Thumb = styled.div`
  width: 52px;
  height: 52px;
  border-radius: 10px;
  background: ${theme.colors.media};
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${theme.colors.muted2};

  img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
`

export const ThumbSkeleton = styled.div`
  width: 52px;
  height: 52px;
  border-radius: 10px;
  background: linear-gradient(100deg, ${theme.colors.media} 30%, ${theme.colors.panel} 50%, ${theme.colors.media} 70%);
  background-size: 200% 100%;
  animation: ${shimmer} 1.3s infinite linear;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`

export const LineInfo = styled.div`
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
`

export const LineName = styled.span`
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`

export const LineNamePlaceholder = styled.span`
  display: inline-block;
  width: 140px;
  max-width: 60%;
  height: 12px;
  border-radius: 6px;
  background: linear-gradient(100deg, ${theme.colors.media} 30%, ${theme.colors.panel} 50%, ${theme.colors.media} 70%);
  background-size: 200% 100%;
  animation: ${shimmer} 1.3s infinite linear;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`

export const LineMeta = styled.span`
  font-size: 13px;
  color: ${theme.colors.muted};
`

export const LinePrice = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  font-weight: 700;
  color: ${theme.colors.text};
  white-space: nowrap;

  .ccy-mark {
    width: 14px;
    height: 14px;
  }
`

// Skeleton order card while the first page loads.
export const CardSkeleton = styled.div`
  height: 132px;
  border-radius: 16px;
  border: 1px solid transparent;
  background: linear-gradient(100deg, ${theme.colors.media} 30%, ${theme.colors.panel} 50%, ${theme.colors.media} 70%);
  background-size: 200% 100%;
  animation: ${shimmer} 1.3s infinite linear;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`

export const Empty = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  text-align: center;
  padding: 90px 20px;
  min-height: 50vh;
`

export const EmptyTitle = styled.p`
  font-size: 22px;
  font-weight: 700;
  margin: 6px 0 0;
`

export const EmptyCta = styled(Button)`
  margin-top: 12px;
`
