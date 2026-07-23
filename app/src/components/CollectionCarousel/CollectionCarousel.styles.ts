import styled from '@emotion/styled'
import { theme } from '~/styles/theme'
import { Icon } from '~/components/Icon'

const { colors, media } = theme

export const Root = styled.section`
  margin-top: 64px;
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
  color: ${colors.text};
`

export const ViewAll = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: none;
  border: 0;
  padding: 0;
  color: ${colors.accent};
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
  &[data-side='left'] {
    left: -40px;
  }
  &[data-side='right'] {
    right: -40px;
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

// Vertical padding + negative horizontal margin reserve room for the cards' outward hover glow (an
// overflow-x scroller also clips overflow-y). Children are AssetCards, sized to the shared 281px.
export const Track = styled.div`
  display: flex;
  gap: 16px;
  overflow-x: auto;
  padding: 12px 10px;
  margin: 0 -10px;
  scroll-snap-type: x proximity;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
  & > * {
    flex: 0 0 281px;
    scroll-snap-align: start;
  }
  ${media.maxWidth('sm')} {
    & > * {
      flex: 0 0 85%;
    }
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
  background: ${colors.lineStrong};
  opacity: 0.5;
  cursor: pointer;
  transition:
    opacity 0.12s ease,
    background 0.12s ease,
    transform 0.12s ease;

  &:hover {
    opacity: 0.8;
  }
  &[data-active] {
    background: ${colors.accent};
    opacity: 1;
    transform: scale(1.1);
  }
`
