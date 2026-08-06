import styled from '@emotion/styled'
import { Link } from 'react-router-dom'
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

// No card: the empty state sits directly on the page's purple field, white text on it.
// The shared empty-state shell (Figma 2103:411677): a translucent black panel, not a bare centred
// column. min-height keeps a page with nothing on it from collapsing to the panel's own height.
export const Empty = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 24px;
  min-height: 50vh;
  padding: 48px 16px;
  border-radius: 16px;
  background: ${colors.overlayLight};
  text-align: center;
  color: ${colors.softWhite};
`

export const EmptyIcon = styled.img`
  width: 138px;
  height: 138px;
`

export const EmptyText = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding-bottom: 16px;
`

export const EmptyTitle = styled.p`
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  line-height: 1.6;
`

export const EmptyBody = styled.p`
  margin: 0;
  max-width: 520px;
  font-size: 16px;
  font-weight: 400;
  line-height: 1.6;
`

export const EmptyCta = styled(Link)`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 310px;
  max-width: 100%;
  height: 52px;
  padding: 0 12px;
  border-radius: ${radius.card};
  /* The panel's own CTA is a deeper translucent black, not a solid purple (Figma 2103:414709). */
  background: ${colors.overlay};
  color: ${colors.softWhite};
  font-size: 15px;
  font-weight: 600;
  line-height: 24px;
  letter-spacing: 0.46px;
  text-transform: uppercase;
  text-decoration: none;
  transition: background 0.15s ease;

  &:hover {
    background: ${colors.overlayHover};
  }
  &:focus-visible {
    outline: 2px solid ${colors.softWhite};
    outline-offset: 2px;
  }
`
