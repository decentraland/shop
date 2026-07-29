import styled from '@emotion/styled'
import { theme } from '~/styles/theme'

const { colors } = theme

// Default flash-sale countdown pill. Consumers restyle via `styled(SaleCountdown)` (AssetCard/ItemDetail).
export const Root = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: ${colors.rarityBg};
  color: ${colors.accent};
  font-size: 11px;
  font-weight: 700;
  border-radius: 6px;
  padding: 2px 8px;
  white-space: nowrap;
`
