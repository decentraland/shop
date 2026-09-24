import styled from '@emotion/styled'
import { theme } from '~/styles/theme'
import { railGutter } from '~/styles/card.styles'
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
    margin: 0;
    ${railGutter};
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
/** The desktop artwork's own width: the CMS validates that asset at exactly 1920x300. */
const ART_WIDTH = '1920px'

export const Hero = styled.section`
  position: relative;
  display: flex;
  align-items: center;
  /* The SAME ratio the CMS validates its desktop asset at (1920x300), not the 340 the original mock drew.
     Matching it is what makes the artwork pixel-exact: object-fit cover then scales by 1.0 and crops
     nothing. At 340 it would scale 1.133x and shave 256px off the LEFT — where a campaign's wordmark
     sits — because object-position anchors right. */
  aspect-ratio: 1920 / 300;
  max-height: 300px;
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

  /**
   * PAST THE ARTWORK'S OWN WIDTH, the strip is FILLED rather than stretched — the same treatment the
   * Marketplace gives the same artwork, and for the same measured reason.
   *
   * Stretching a 1920px image across a 3440px window drew it at 2.7x native and, once the box's ratio ran
   * away from the art's, cropped 466px of a 300px-tall source: soft, and cut off at the bottom.
   *
   * So the artwork below stops at its native width and centres, and these layers fill what is left on
   * either side with a blurred copy of the same image. 600% 100% is what keeps that from
   * reading as a ghost of the art: it samples only the empty left sixth of the frame and stretches THAT
   * across, carrying the art's own light and none of its subject. The horizontal distortion is free, the
   * layer being blurred past recognition; the vertical scale stays 100%, so nothing is cropped.
   */
  @media (min-width: ${ART_WIDTH}) {
    /* One filler per side, each sampling the edge of the artwork nearest it, so the left of the strip
       carries the art's left-hand light and the right its right-hand light. A single filler would wash
       one side in the other's colour, which on this artwork means a dark purple bleeding into the bright
       side. Their shared boundary sits at the strip's midpoint, which the centred artwork always covers. */
    &::before,
    &::after {
      content: '';
      position: absolute;
      /* Overscanned top and bottom, or the blur fades into transparency at the edges of the strip. */
      top: -6%;
      bottom: -6%;
      z-index: 0;
      background-image: var(--banner-art);
      background-size: 600% 100%;
      filter: blur(32px);
      pointer-events: none;
    }
    &::before {
      left: -6%;
      right: 50%;
      background-position: left center;
    }
    &::after {
      left: 50%;
      right: -6%;
      background-position: right center;
    }
  }

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
    /* Square, like the 400x400 the CMS validates the mobile asset at. */
    aspect-ratio: 1 / 1;
    max-height: none;
    margin-top: -16px;
    align-items: flex-end;
    justify-content: center;
    padding-bottom: 43px;
  }
`

// The prop is declared in its HTML casing because React 18 has no `fetchPriority` of its own (it lands in
// 19) and warns about the camelCase spelling on every render. Emotion forwards it — `is-prop-valid` knows
// the attribute — so it reaches the DOM either way; this is only about which spelling stays quiet.
export const HeroBg = styled.img<{ fetchpriority?: 'high' | 'low' | 'auto' }>`
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center right;

  /* Never drawn above its native width, and centred. Below the cap this is inert: the image already is
     the strip. */
  @media (min-width: ${ART_WIDTH}) {
    left: 0;
    right: 0;
    width: ${ART_WIDTH};
    margin-inline: auto;
    z-index: 1;
    /* BOTH edges faded into the fillers, since the artwork is centred rather than pinned to one side. */
    -webkit-mask-image: linear-gradient(to right, transparent, #000 140px, #000 calc(100% - 140px), transparent);
    mask-image: linear-gradient(to right, transparent, #000 140px, #000 calc(100% - 140px), transparent);
  }
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
