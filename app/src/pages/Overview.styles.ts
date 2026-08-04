import styled from '@emotion/styled'
import { theme } from '~/styles/theme'
import { Button } from '~/components/Button'

const { colors, media } = theme

// Empty/crash state — also reused by App's CrashFallback.
export const Empty = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  text-align: center;
  padding: 80px 20px;
`

export const EmptyTitle = styled.p`
  font-size: 22px;
  font-weight: 700;
  margin: 0;
`

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
    // Same side-padding + negative-margin trick as the carousel Track: the scroller clips both axes, so
    // without it the first card's hover ring/scale is cut at the rail's left edge.
    padding: 12px 14px;
    margin: 0 0 0 -14px;
    scroll-padding-inline: 14px;
    // Hide the native scrollbar so these discovery rails match the carousels above (which also hide
    // it) — otherwise the home page shows one rail with a grey scrollbar and the rest without.
    scrollbar-width: none;
    -ms-overflow-style: none;
  }
  & [data-rail]::-webkit-scrollbar {
    width: 0;
    height: 0;
    display: none;
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
  aspect-ratio: 1920 / 340;
  max-height: 340px;
  margin-bottom: 50px;
  overflow: hidden;
  background: #14161b;

  /* The ONLY full-bleed element on the page: it spans the window while every other section keeps the
     .page gutter. Two things have to be undone, not one — the 54px side padding AND the 1760px
     max-width, which on a wider window would otherwise leave the banner centred with white beside it.
     The 50% - 50vw margin handles both at once: it measures from the container's own centre out to the
     window edge, so it is correct whether the cap is in effect or not, and needs no breakpoint-specific
     value for the mobile padding.
     No border-radius, unlike every other banner in the app — a corner radius on an element flush with
     the window edges reads as a rendering mistake, since there is nothing outside it to round against. */
  width: 100vw;
  margin-inline: calc(50% - 50vw);
  border-radius: 0;

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
  color: ${colors.white};
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
// The carousel rail + its page dots are the shared paged-rail primitives (OutfitsRow pages too).
export { CarouselTrack as Track, Dots, Dot } from '~/styles/row.styles'

// Two side-by-side promo banners, stacking to one column on mobile.
