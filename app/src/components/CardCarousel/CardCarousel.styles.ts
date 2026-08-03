import styled from '@emotion/styled'
import { theme } from '~/styles/theme'

const { colors, media } = theme

// Reuses the global `.row` head/title/viewall; adds the Figma side arrows + pagination dots.
export const Carousel = styled.section`
  position: relative;
  margin-bottom: 40px;
`

export const Viewport = styled.div`
  position: relative;
`

// White circle with a bold chevron. `--ov-arrow-top` (set in JS) centres them on the card media.
export const Arrow = styled.button`
  position: absolute;
  top: var(--ov-arrow-top, 110px);
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

// A grid of a FIXED whole number of cards per view (5 → 4 → 3 → 2) so an exact integer of cards always
// fills the viewport with a 16px gap — no partial card is ever cut off. Scrollbar hidden.
export const Track = styled.div`
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: calc((100% - 64px) / 5);
  gap: 16px;
  overflow-x: auto;
  overflow-y: hidden;
  // Horizontal padding reserves room for the first/last card's outward hover glow — an overflow-x
  // scroller clips both axes, so 0 side padding cropped the ring. The matching negative margin-left
  // pulls the track back so the first card lines up with the section title and the page gutter; the glow
  // overflows into the gutter. (The arrows above are sized/positioned to keep an equal gap despite it.)
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
