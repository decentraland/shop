import styled from '@emotion/styled'
import { Link } from 'react-router-dom'
import { theme } from '~/styles/theme'

const { colors, media } = theme

// Shared "row" primitive: a titled section with a horizontal, scroll-snapping rail of AssetCards
// (Overview carousels + discovery rails, Recently viewed, Followed creators). Import as
// `import * as Row from '~/styles/row.styles'`.

export const Root = styled.section`
  margin-bottom: 50px;
`

export const Head = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
`

export const Title = styled.h2`
  font-size: 50px;
  font-weight: 900;
  letter-spacing: -0.05em;
  line-height: 1.1;
  color: ${colors.softWhite};

  ${media.maxWidth('mobile')} {
    font-size: 32px;
  }
`

export const ViewAll = styled(Link)`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: ${colors.softWhite};
  font-weight: 600;
  font-size: 15px;
  letter-spacing: 0.046em;
  text-transform: uppercase;

  &:hover {
    text-decoration: underline;
  }
`

// Cards have an OUTWARD hover glow; an overflow-x scroller also clips overflow-y, so the rail reserves
// room for the glow with PADDING on all sides rather than a negative margin (which would re-clip it).
// The matching negative margin-left then pulls the track back by that 14px so the FIRST card's edge
// lines up with the section title and the page gutter instead of sitting inset — the glow simply
// overflows into the gutter. `data-rail` lets a page scope an override of the flex rail (e.g. Overview
// swaps it for a fixed-N-per-view grid).
export const Track = styled.div`
  display: flex;
  gap: 16px;
  overflow-x: auto;
  padding: 12px 14px;
  margin-left: -14px;
  scroll-padding-inline: 14px;
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
