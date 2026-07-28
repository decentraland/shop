import styled from '@emotion/styled'
import { theme } from '~/styles/theme'

const { colors, radius } = theme

// A card-shaped shimmer placeholder, sized to the real AssetCard so a loading grid/rail holds its
// eventual height.
export const SkeletonCard = styled.div`
  min-height: 300px;
  border: 1px solid ${colors.line};
  border-radius: ${radius.card};
  background: linear-gradient(100deg, #efeef2 30%, #e2e0e7 50%, #efeef2 70%);
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite linear;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`
