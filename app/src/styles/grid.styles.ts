import styled from '@emotion/styled'
import { theme } from '~/styles/theme'

const { media } = theme

// The item results grid. `data-variant='collections'` widens tracks for CollectionCard.
export const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 16px;

  &[data-variant='collections'] {
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  }

  ${media.maxWidth('sm')} {
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }
`
