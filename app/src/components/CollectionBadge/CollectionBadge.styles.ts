import styled from '@emotion/styled'
import { theme } from '~/styles/theme'
import { Ava } from '~/components/CreatorBadge/badge.styles'

// 2×2 collage of collection thumbnails, reusing the round avatar slot. The line-strong background
// shows through the 1px gaps as hairline dividers between thumbnails. `styled(Ava)` so it keeps the
// shared avatar box (size/round/flex) while overriding the fill.
export const Collage = styled(Ava)`
  display: flex;
  flex-direction: column;
  overflow: hidden;
  gap: 1px;
  background: ${theme.colors.lineStrong};

  /* Rows stack; each cell (<img>) covers its share. A single row (≤2 thumbnails) spans full height. */
  & .collection-collage__row {
    display: flex;
    flex: 1 1 50%;
    min-height: 0;
    gap: 1px;
  }
  & .collection-collage__row--full {
    flex-basis: 100%;
  }
  & .collection-collage__row img {
    flex: 1 1 0;
    min-width: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
`
