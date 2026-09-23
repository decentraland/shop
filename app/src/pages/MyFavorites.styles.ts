import styled from '@emotion/styled'
import { theme } from '~/styles/theme'

const { colors, radius } = theme

export const Head = styled.div`
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 20px;
`

export const Title = styled.h1`
  margin: 0;
  color: ${colors.softWhite};
`

export const Count = styled.span`
  color: ${colors.gray4};
  font-size: 14px;
`

export const RateBanner = styled.p`
  display: flex;
  align-items: center;
  gap: 10px;
  background: ${colors.rarityBg};
  color: ${colors.accent};
  border-radius: 12px;
  padding: 12px 16px;
  margin-bottom: 14px;
  font-weight: 600;
  font-size: 14px;
`

export const ErrorWrap = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 16px;
`

export const Retry = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 40px;
  padding: 0 20px;
  border: 0;
  border-radius: ${radius.card};
  background: ${colors.accent};
  color: ${colors.softWhite};
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s ease;

  &:hover {
    background: ${colors.accentHover};
  }
  &:focus-visible {
    outline: 2px solid ${colors.accent};
    outline-offset: 2px;
  }
`

// min-height keeps a page with nothing on it from collapsing to the panel's own height.
export const Empty = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
`

/**
 * The gap above the suggestions rail.
 *
 * `Row.Root` carries a bottom margin but no top one — on the home page the row above it supplies that
 * space, and here there is no row above, only the grid and its load-more. Without this the heading
 * lands against the last line of cards.
 */
export const Suggested = styled.div`
  width: 100%;
  margin-top: 56px;

  ${theme.media.maxWidth('mobile')} {
    margin-top: 36px;
  }
`
