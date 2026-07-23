import styled from '@emotion/styled'
import { Link } from 'react-router-dom'
import { theme } from '~/styles/theme'

const { colors, media } = theme

// Shared "row" primitive: a titled section with a horizontal, scroll-snapping rail of AssetCards
// (Overview carousels + discovery rails, Recently viewed, Followed creators). Import as
// `import * as Row from '~/styles/row.styles'`.

export const Root = styled.section`
  margin-bottom: 40px;
`

export const Head = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
`

export const Title = styled.h2`
  font-size: 20px;
  font-weight: 600;
  color: ${colors.text};
`

export const ViewAll = styled(Link)`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: ${colors.accent};
  font-weight: 600;
  font-size: 15px;
  letter-spacing: 0.046em;
  text-transform: uppercase;
`

// Cards have an OUTWARD hover glow; an overflow-x scroller also clips overflow-y, so the rail reserves
// room for the glow with vertical PADDING + a negative horizontal margin (so the side glow bleeds into
// the page gutter) rather than a negative vertical margin (which would re-clip it). `data-rail` lets a
// page scope an override of the flex rail (e.g. Overview swaps it for a fixed-N-per-view grid).
export const Track = styled.div`
  display: flex;
  gap: 16px;
  overflow-x: auto;
  padding: 12px 10px;
  margin: 0 -10px;
  scroll-snap-type: x proximity;

  & > * {
    flex: 0 0 281px;
    scroll-snap-align: start;
  }
  ${media.maxWidth('sm')} {
    & > * {
      flex: 0 0 44vw;
    }
  }
`
