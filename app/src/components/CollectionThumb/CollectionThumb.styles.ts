import styled from '@emotion/styled'
import { theme } from '~/styles/theme'

const { colors } = theme

// Shared cover/thumbnail for a collection (which has no image of its own): a grid of the collection's
// first up-to-4 item thumbnails, each over its rarity gradient. Fills its container — the caller sizes
// and shapes it via className. `data-count` reshapes the grid so 1/2/3/4 items each look deliberate.
// Cells carry `data-testid="coll-thumb-cell"` (also the styling hook consumers like CollectionCard reach in on).
// The gaps are the grid's internal borders: the container colour shows through a 0.5px gutter, and each
// cell paints the media fill over it (so an untinted cell reads as the card's own background).
// Rows and columns are minmax(0, 1fr), never a bare 1fr. A bare `1fr` is `minmax(auto, 1fr)`, and a
// track's automatic minimum is its content's min-content size — which for a cell holding a
// width:100% image is the image's own aspect-ratio height. So a row as wide as the cover but only a
// fraction of its height (one cell across the full width, or the 3-item layout's spanning top cell)
// grew to the image's square height, overflowed the cover box, and got clipped by `overflow: hidden`:
// the artwork lost its top and bottom and sat low in the frame. object-fit could not save it — the
// IMG ELEMENT was larger than the visible area, so there was nothing left for it to fit. minmax(0, …)
// lets the tracks shrink to their share of the box, which is what makes the cells' object-fit real.
export const Mosaic = styled.span`
  display: grid;
  width: 100%;
  height: 100%;
  gap: 0.5px;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  grid-auto-rows: minmax(0, 1fr);
  background: ${colors.lineStrong};

  &[data-count='1'] {
    grid-template-columns: minmax(0, 1fr);
  }
  &[data-count='2'] {
    grid-template-rows: minmax(0, 1fr);
  }
  /* 3 items: first spans the full top row, the other two share the bottom row. */
  &[data-count='3'] [data-testid='coll-thumb-cell']:first-child {
    grid-column: span 2;
  }

  & [data-testid='coll-thumb-cell'] {
    display: grid;
    place-items: center;
    overflow: hidden;
    /* Same reason as the tracks: a grid ITEM's automatic minimum is also its min-content size, so
       without these the cell itself would refuse to shrink below the image's intrinsic box. */
    min-width: 0;
    min-height: 0;
    background-color: ${colors.media};
    background-size: cover;
    background-position: center;
  }
  & [data-testid='coll-thumb-cell'] img {
    width: 100%;
    height: 100%;
    /* The img is a grid item of the cell, so it gets the same automatic minimum as the tracks above:
       min-content, i.e. its own aspect-ratio height. Without this it keeps its square box no matter how
       short the cell is, and the cell's overflow: hidden crops the artwork. */
    min-width: 0;
    min-height: 0;
    object-fit: cover;
    display: block;
  }
`
