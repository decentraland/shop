import styled from '@emotion/styled'
import { Link } from 'react-router-dom'
import { theme } from '~/styles/theme'
import { Button } from '~/components/Button'

const { colors, radius, media } = theme

export const EmptyCta = styled(Button)`
  margin-top: 10px;
`

// Figma hero CTA: the purple button trimmed to the 40px hero spec.
export const HeroCta = styled(Button)`
  height: 40px;
  padding: 0 16px;
  display: inline-flex;
  align-items: center;
`

// The page scopes an override of the shared rail (RecentlyViewed / FollowedCreators render Row.Track,
// which carries data-rail) so every rail on this page shows the same fixed-N-per-view card width as the
// carousels.
export const Overview = styled.div`
  & [data-rail] {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: calc((100% - 64px) / 5);
    padding: 12px 0;
    margin: 0;
  }
  ${media.maxWidth('xl')} {
    & [data-rail] {
      grid-auto-columns: calc((100% - 48px) / 4);
    }
  }
  ${media.maxWidth('lg')} {
    & [data-rail] {
      grid-auto-columns: calc((100% - 32px) / 3);
    }
  }
  ${media.maxWidth('sm')} {
    & [data-rail] {
      grid-auto-columns: calc((100% - 16px) / 2);
    }
  }
`

// Full-bleed rounded banner: the art is a single background image, title + CTA overlaid on the left.
export const Hero = styled.section`
  position: relative;
  display: flex;
  align-items: center;
  aspect-ratio: 1721 / 304;
  max-height: 340px;
  margin-bottom: 40px;
  overflow: hidden;
  border-radius: ${radius.banner};
  background: #14161b;

  ${media.maxWidth('mobile')} {
    aspect-ratio: auto;
    min-height: 200px;
    max-height: none;
  }
`

export const HeroBg = styled.img`
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center right;
`

// Left-to-right dark scrim so the title + CTA keep AA contrast over the busy art at every width.
export const HeroScrim = styled.div`
  position: absolute;
  inset: 0;
  z-index: 1;
  background: linear-gradient(90deg, rgba(10, 11, 14, 0.78) 0%, rgba(10, 11, 14, 0.45) 38%, rgba(10, 11, 14, 0) 68%);
`

export const HeroInner = styled.div`
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 24px;
  padding: 0 64px;

  ${media.maxWidth('mobile')} {
    padding: 0 24px;
  }
`

export const HeroTitle = styled.h1`
  margin: 0;
  color: #fff;
  font-size: clamp(24px, 3.2vw, 36px);
  font-weight: 700;
  line-height: 1.235;
  text-transform: uppercase;
`

// Reuses the global `.row` head/title/viewall; adds the Figma side arrows + pagination dots.
export const Carousel = styled.section`
  position: relative;
  margin-bottom: 40px;
`

export const Viewport = styled.div`
  position: relative;
`

// ~53px white circle with a bold chevron. `--ov-arrow-top` (set in JS) centres them on the card media.
export const Arrow = styled.button`
  position: absolute;
  top: var(--ov-arrow-top, 110px);
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
  &[data-side='right'] {
    right: -40px;
  }
  &[data-side='left'] {
    left: -40px;
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
  padding: 12px 0;
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

// Two side-by-side promo banners, stacking to one column on mobile.
export const Promos = styled.section`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
  margin: 0 0 40px;

  ${media.maxWidth('mobile')} {
    grid-template-columns: 1fr;
  }
`

export const Promo = styled(Link)`
  display: block;
  border-radius: ${radius.banner};
  overflow: hidden;
  filter: drop-shadow(0 2.5px 6.875px rgba(0, 0, 0, 0.25));

  & img {
    display: block;
    width: 100%;
    height: auto;
    aspect-ratio: 867 / 386;
    object-fit: cover;
  }
`
