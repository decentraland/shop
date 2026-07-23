import styled from '@emotion/styled'
import { theme } from '~/styles/theme'

const { colors, radius } = theme

// "Buy the set" bar — total + add-all-to-cart (AOV lever) on collection/creator pages.
export const Root = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  padding: 12px 16px;
  margin-bottom: 20px;
  border: 1px solid ${colors.line};
  border-radius: ${radius.card};
  background: ${colors.media};
`

export const Summary = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  color: ${colors.text};
`
