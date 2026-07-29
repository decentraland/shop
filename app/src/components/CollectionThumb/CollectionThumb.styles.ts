import styled from '@emotion/styled'
import { theme } from '~/styles/theme'

const { colors } = theme

// Shared cover/thumbnail for a collection (which has no image of its own): a grid of the collection's
// first up-to-4 item thumbnails, each over its rarity gradient. Fills its container — the caller sizes
// and shapes it via className. `data-count` reshapes the grid so 1/2/3/4 items each look deliberate.
// Cells carry `data-testid="coll-thumb-cell"` (also the styling hook consumers like CollectionCard reach in on).
export const Mosaic = styled.span`
  display: grid;
  width: 100%;
  height: 100%;
  gap: 1px;
  grid-template-columns: 1fr 1fr;
  grid-auto-rows: 1fr;
  background: ${colors.line};

  &[data-count='1'] {
    grid-template-columns: 1fr;
  }
  &[data-count='2'] {
    grid-template-rows: 1fr;
  }
  /* 3 items: first spans the full top row, the other two share the bottom row. */
  &[data-count='3'] [data-testid='coll-thumb-cell']:first-child {
    grid-column: span 2;
  }

  & [data-testid='coll-thumb-cell'] {
    display: grid;
    place-items: center;
    overflow: hidden;
    background-size: cover;
    background-position: center;
  }
  & [data-testid='coll-thumb-cell'] img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
`
