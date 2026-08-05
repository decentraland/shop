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

// THE section heading for every titled row on the site. Straight off Figma's shared "Categories Dropdown"
// component (913:135574 "Featured Products", 1878:67135 "Buy the Look" — same component, so one style):
// Inter Semi Bold 20/1.5 in neutrals/soft-black-1, no tracking. It was a 50px black display face with
// -0.05em tracking, which is a page-title treatment, not a section one — at that size two headings and a
// carousel filled a screen on their own.
// Deliberately NO mobile step-down: the mobile frame (1016:84664) draws the same 20px, and a heading this
// size has nowhere to shrink to.
export const Title = styled.h2`
  font-size: 20px;
  font-weight: 600;
  line-height: 1.5;
  color: ${colors.softWhite};
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
// min-height is the height of one Dot, so a rail that renders this strip EMPTY — while it loads, or when
// it has a single page — still occupies the 24px the populated strip does. Without it the box collapsed
// to its margin and the dots' 12px arrived with the content, moving every section below the rail down.
export const Dots = styled.div`
  display: flex;
  justify-content: center;
  gap: 8px;
  min-height: 12px;
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

// Positioning context for the side arrows of a paged rail.
export const Viewport = styled.div`
  position: relative;
`

// White circle with a bold chevron, sitting in the page gutter beside a paged rail. Vertically
// centred on the rail unless the row pins `--rail-arrow-top` (the Overview carousels center them on
// the card media band instead of the whole card).
export const Arrow = styled.button`
  position: absolute;
  top: var(--rail-arrow-top, 50%);
  transform: translateY(-50%);
  z-index: 5;
  width: 44px;
  height: 44px;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
  filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.18));
  transition:
    transform 0.15s ease,
    filter 0.15s ease,
    opacity 0.15s ease;

  & img {
    display: block;
    width: 100%;
    height: 100%;
  }
  // Arrows sit in the page gutter (nav-aligned 54px), not over the rail. The 44px circle + these
  // offsets leave an equal ~8px gap to the first/last card: the track is pulled 14px flush-left so the
  // first card sits at the gutter edge while the last keeps its 14px inset — hence the left arrow is
  // pushed out further than the right so both gaps match.
  &[data-side='right'] {
    right: -38px;
  }
  &[data-side='left'] {
    left: -52px;
  }
  &[data-side='left'] img {
    transform: scaleX(-1);
  }
  &:hover:not(:disabled) {
    transform: translateY(-50%) scale(1.07);
  }
  /* Hidden (not dimmed) at the ends so the two arrows never look mismatched. */
  &:disabled {
    opacity: 0;
    pointer-events: none;
  }

  ${media.maxWidth('lg')} {
    display: none;
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
