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
  color: ${colors.softWhite};
`

export const EmptyTitle = styled.p`
  font-size: 22px;
  font-weight: 700;
  margin: 0;
`

export const EmptyBody = styled.p`
  margin: 0;
  color: ${colors.gray4};
`

export const EmptyCta = styled(Button)`
  margin-top: 10px;
`

// Figma 1997:318583 "Default": a fixed 246×52 amethyst button, 8px radius, credit mark + label.
// The `purple` variant already carries the amethyst gradient, the uppercase and the soft-white label, so
// only the box and the type metrics are restated — the design's 15px/0.46px differ from the variant's
// 13px/0.046em, and 0.046em would be 0.69px at this size.
export const HeroCta = styled(Button)`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 246px;
  height: 52px;
  padding: 0 16px;
  border-radius: ${theme.radius.btn};

  /* Both entry points into buying credits look and behave alike, so this carries the nav's GET CREDITS
     treatment: the orange BUY Button gradient, and a hover that keeps the gradient and adds the ring
     rather than filling flat (the design system's Credits type). Doubled ampersands because the purple
     variant's own rules are an attribute selector and outweigh this class on their own. */
  && {
    background: ${theme.gradients.buyBtn};
    font-size: 15px;
    letter-spacing: 0.46px;
    transition: filter 0.15s ease;
  }
  /* The variant fades a solid accent overlay in on hover; the credits button has no flat state. */
  &&::before {
    content: none;
  }
  /* Hover ring: a gradient stroke OUTSIDE the button with a gap the page shows through — masked, since
     a plain outline can't take a gradient. */
  &&::after {
    content: '';
    position: absolute;
    inset: -6px;
    border-radius: calc(${theme.radius.btn} + 6px);
    padding: 2px;
    background: ${theme.gradients.buyBtn};
    -webkit-mask:
      linear-gradient(#fff 0 0) content-box,
      linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor;
    mask:
      linear-gradient(#fff 0 0) content-box,
      linear-gradient(#fff 0 0);
    mask-composite: exclude;
    opacity: 0;
    transition: opacity 0.15s ease;
    pointer-events: none;
  }
  &&:hover:not(:disabled) {
    filter: brightness(1.08);
  }
  &&:hover:not(:disabled)::after {
    opacity: 1;
  }
  &&:active:not(:disabled) {
    filter: brightness(0.95);
  }
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

// Full-bleed banner (Figma dark theme): breaks out of the centred page container to run edge to edge,
// flush under the sub-nav. The art is a single background image, title + CTA overlaid on the left.
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

  /* …and then put the CONTENT back where the page's content is. The mirror image of the margin above: it
     pulled the box out to the window edges, this pushes the copy back in by exactly the same distance, so
     the headline starts on the same vertical line as every section title below it.
     A percentage in padding resolves against the CONTAINING BLOCK's width — the .page content box — not
     against this element's own 100vw, which is what makes the same expression work at every viewport,
     including wider than the 1760px cap where the gutter is no longer 54px. Verified: 54px at a 1440
     window, 134px at 1920 (the cap's own inset plus the gutter), 16px at 390. */
  padding-inline: calc(50vw - 50%);

  /* The mobile frame (Figma 1016:89483) is a different composition, not a squeeze of the wide one:
     a square collage with the copy CENTERED near its bottom edge (title block ends 43px above it). */
  ${media.maxWidth('mobile')} {
    aspect-ratio: 390 / 389;
    max-height: none;
    margin-top: -16px;
    align-items: flex-end;
    justify-content: center;
    padding-bottom: 43px;
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

// No side padding of its own: the Hero's padding-inline already lands this on the page's content edge, and
// the 64px this used to add is what put the headline out of line with the section titles below.
export const HeroInner = styled.div`
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 32px;

  ${media.maxWidth('mobile')} {
    align-items: center;
    text-align: center;
  }
`

// Figma 1864:223112: Inter Bold 48/1.235 in white, sentence case — the uppercase this used to force is
// gone with the old "FASHION WEEK OUTFITS" copy.
// The clamp reaches exactly 48px from a 1200px viewport up, so desktop matches the design and a phone gets
// a headline that fits rather than three wrapped lines. The design's own `capitalize` is deliberately NOT
// applied: it would render "A New Way To Shop", capitalising the "to" the copy writes in lower case.
export const HeroTitle = styled.h1`
  margin: 0;
  color: ${colors.white};
  font-size: clamp(28px, 4vw, 48px);
  font-weight: 700;
  line-height: 1.235;

  /* Figma 2004:322552: the phone headline is a fixed 32, larger than the clamp's floor. */
  ${media.maxWidth('mobile')} {
    font-size: 32px;
  }
`

// Reuses the global `.row` head/title/viewall; adds the Figma side arrows + pagination dots.
export const Carousel = styled.section`
  position: relative;
  margin-bottom: 40px;
`

// A grid of a FIXED whole number of cards per view (5 → 4 → 3 → 2) so an exact integer of cards always
// fills the viewport with a 16px gap — no partial card is ever cut off. Scrollbar hidden.
// The carousel rail, its arrows and its page dots are the shared paged-rail primitives (OutfitsRow
// pages the same way).
export { CarouselTrack as Track, Viewport, Arrow, Dots, Dot } from '~/styles/row.styles'

// Two side-by-side live promo tiles (LivePromo), stacking to one column on mobile.
export const Promos = styled.section`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
  margin: 0 0 50px;

  ${media.maxWidth('mobile')} {
    grid-template-columns: 1fr;
  }
`
