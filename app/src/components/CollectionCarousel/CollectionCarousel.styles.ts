import styled from '@emotion/styled'
import { theme } from '~/styles/theme'
import { Icon } from '~/components/Icon'

const { colors, media } = theme

// The cart zeroes this margin and supplies its own spacing, so the value only affects the PDP.
export const Root = styled.section`
  margin-top: 40px;
`

export const Head = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
`

export const Title = styled.h2`
  font-size: 22px;
  font-weight: 700;
  color: ${colors.softWhite};
`

export const ViewAll = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: none;
  border: 0;
  padding: 0;
  color: ${colors.softWhite};
  font-weight: 700;
  font-size: 13px;
  letter-spacing: 0.046em;
  text-transform: uppercase;
  cursor: pointer;
  white-space: nowrap;

  &:hover {
    text-decoration: underline;
  }
`

// A directional arrow (not an up/down toggle) — the shared chevron rotated to point right.
export const ViewAllIco = styled(Icon)`
  transform: rotate(-90deg);
`

export const Viewport = styled.div`
  position: relative;
`

// Side arrows: same treatment as the Overview rail — carousel-arrow.svg floated with a soft shadow,
// centred on the card media band. `data-side` mirrors the left arrow.
export const Arrow = styled.button`
  position: absolute;
  top: 112px;
  transform: translateY(-50%);
  z-index: 5;
  width: 53px;
  height: 53px;
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
  // Sit the arrows in the page gutter (aligned to the nav's 54px), not over the cards — at -40px their
  // inner edge landed ~13px onto the first/last card.
  &[data-side='left'] {
    left: -53px;
  }
  &[data-side='right'] {
    right: -53px;
  }
  &[data-side='left'] img {
    transform: scaleX(-1);
  }
  &:hover:not(:disabled) {
    transform: translateY(-50%) scale(1.07);
  }
  &:disabled {
    opacity: 0;
    pointer-events: none;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
  ${media.maxWidth('lg')} {
    display: none;
  }
`

// A FIXED whole number of cards per view (5 desktop → 4 → 3 → 2, mirroring the Overview rail) so an
// exact integer of cards fills the viewport and no partial card is ever cut off. `overflow-x: auto`
// also clips overflow-y, so the padding reserves room on ALL sides for the cards' outward hover glow;
// `scroll-padding-inline` keeps the snap points aligned to that gutter, and the negative margin-left
// pulls the track back so the first card's edge lines up with the section title instead of sitting
// inset. NOTE: this assumes >=14px of left padding on the container to overflow into (true for the PDP
// and cart, which sit inside the page gutter). In a tighter container, scope the negative margin back.
export const Track = styled.div`
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

  &::-webkit-scrollbar {
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
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-top: 18px;
`

export const Dot = styled.button`
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 0;
  padding: 0;
  /* Figma "Carousel Dots" (verbatim): rgba(0,0,0,0.5) at rest, Brand/Orange active. */
  background: rgba(0, 0, 0, 0.5);
  cursor: pointer;
  transition:
    opacity 0.12s ease,
    background 0.12s ease,
    transform 0.12s ease;

  &:hover {
    opacity: 0.8;
  }
  &[data-active] {
    background: ${colors.media};
    opacity: 1;
    transform: scale(1.1);
  }
`
