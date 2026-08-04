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

  &:hover {
    text-decoration: underline;
  }
`

// Paged variant of the rail: fixed N cards per view (matching the Overview carousels), hidden
// scrollbar, mandatory snap. Same padding/negative-margin dance as Track below — the side padding
// reserves room for the first/last card's outward hover glow, the negative margin re-aligns the
// first card with the section title.
export const CarouselTrack = styled.div`
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: calc((100% - 64px) / 5);
  gap: 16px;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 12px 14px;
  margin-left: -14px;
  scroll-padding-inline: 14px;
  scroll-snap-type: x mandatory;
  scrollbar-width: none;
  -ms-overflow-style: none;

  &::-webkit-scrollbar {
    width: 0;
    height: 0;
    display: none;
  }
  & > * {
    scroll-snap-align: start;
  }

  ${media.maxWidth('xl')} {
    grid-auto-columns: calc((100% - 48px) / 4);
  }
  ${media.maxWidth('lg')} {
    grid-auto-columns: calc((100% - 32px) / 3);
  }
  ${media.maxWidth('sm')} {
    grid-auto-columns: calc((100% - 16px) / 2);
  }
`

// Page indicators under a paged rail, one per viewport-width of scroll.
export const Dots = styled.div`
  display: flex;
  justify-content: center;
  gap: 8px;
  margin-top: 12px;
`

export const Dot = styled.button`
  width: 12px;
  height: 12px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: #d9d6de;
  transition: background 0.15s ease;

  &[data-active] {
    background: ${colors.accent};
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
