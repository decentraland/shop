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

export const Count = styled.span`
  color: ${colors.muted};
  font-size: 14px;
`

export const Empty = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 24px;
  min-height: 50vh;
  padding: 48px 16px;
  background: ${colors.white};
  border-radius: 16px;
  text-align: center;
  color: ${colors.text};
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
  height: 56px;
  padding: 0 12px;
  border-radius: ${radius.card};
  background: ${colors.accent};
  color: ${colors.softWhite};
  font-size: 15px;
  font-weight: 600;
  line-height: 24px;
  letter-spacing: 0.46px;
  text-transform: uppercase;
  text-decoration: none;
  transition: background 0.15s ease;

  &:hover {
    background: ${colors.accentHover};
  }
  &:focus-visible {
    outline: 2px solid ${colors.accent};
    outline-offset: 2px;
  }
`
