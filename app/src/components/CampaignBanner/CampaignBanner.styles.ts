import styled from '@emotion/styled'
import { Button } from '~/components/Button'
import { theme } from '~/styles/theme'

const { colors, gradients, media, radius } = theme

/**
 * The event's banner, above its grid.
 *
 * Deliberately the SAME geometry as the home hero (see pages/Overview.styles.ts): same ratios at both
 * sizes, same full-bleed treatment, same copy inset. One banner format means one set of artwork can
 * serve both surfaces, and the event does not announce itself in a different shape from everything else.
 */
/**
 * How wide the desktop artwork actually is. The CMS validates that asset at exactly 1920x300, so this is
 * the widest it can ever be drawn without upscaling.
 */
const ART_WIDTH = '1920px'

export const Banner = styled.section`
  position: relative;
  display: flex;
  align-items: center;
  /* The SAME ratio the CMS validates its desktop asset at (1920x300), not the 340 the original mock drew.
     With the width capped above, matching the ratio is what makes the banner pixel-exact: object-fit
     cover then scales by 1.0 and crops nothing. At 340 it would scale 1.133x and shave 256px off the
     LEFT — where the campaign wordmark sits — because object-position anchors right. */
  aspect-ratio: 1920 / 300;
  max-height: 300px;
  margin-bottom: 32px;
  overflow: hidden;
  background: #14161b;

  /* Out to the window edges, undoing both the page gutter and its max-width at once. No border-radius:
     rounded corners flush with the window read as a rendering fault. */
  width: 100vw;
  margin-inline: calc(50% - 50vw);
  border-radius: 0;

  /* …and the copy back onto the page's content edge, so the headline starts on the same vertical line as
     the section titles below it. The percentage resolves against the CONTAINING block, not this
     element's 100vw, which is what makes one expression work at every viewport. */
  padding-inline: calc(50vw - 50%);

  /**
   * PAST THE ARTWORK'S OWN WIDTH, the strip is filled rather than stretched — the same treatment the
   * Marketplace gives the same artwork, and for the same measured reason.
   *
   * Stretching a 1920px image across a 3440px window drew it at 2.7x its native size and, once the box's
   * ratio ran away from the art's, cropped 466px of a 300px-tall source. It looked soft and cut off.
   *
   * So the sharp copy below stops at its native width and centres, and these layers fill what is left on
   * either side with a blurred copy of the same image. 600% 100% is what keeps it from
   * reading as a ghost: it samples only the empty left sixth of the frame and stretches THAT across, so
   * the filler carries the art's own light and none of its subject. The horizontal distortion is free,
   * the layer being blurred past recognition. The vertical scale stays 100%, so nothing is cropped.
   *
   * Above the cap only: below it the sharp copy already covers the strip and a filler would just soften
   * the artwork's own left edge, which is where the campaign wordmark sits.
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

  /* The hero's mobile frame is a different composition, not a squeeze of the wide one: near-square, with
     the copy centred near the bottom edge. Matched here so one mobile asset also serves both. */
  ${media.maxWidth('mobile')} {
    /* Square, like the 400x400 the CMS validates the mobile asset at. */
    aspect-ratio: 1 / 1;
    max-height: none;
    align-items: flex-end;
    justify-content: center;
    padding-bottom: 43px;
  }
`

export const Bg = styled.img`
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

export const Inner = styled.div`
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 16px;

  /* No side padding of its own: the Banner's padding-inline already lands this on the page's content
     edge, exactly as HeroInner relies on the Hero's. */

  ${media.maxWidth('mobile')} {
    align-items: center;
    text-align: center;
  }
`

export const Title = styled.h2`
  margin: 0;
  color: ${colors.white};
  font-size: clamp(22px, 2.6vw, 34px);
  font-weight: 700;
  line-height: 1.235;
`

export const Cta = styled(Button)`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 44px;
  padding: 0 28px;
  border-radius: ${radius.btn};

  /* The home hero's treatment, so a campaign's button looks the same wherever it appears: the orange BUY
     gradient rather than the flat purple variant, which sits too close to the artwork behind it to read as
     a button at all. Doubled ampersands because the variant's own rules are an attribute selector and
     outweigh this class on their own. */
  && {
    background: ${gradients.buyBtn};
    font-size: 15px;
    letter-spacing: 0.46px;
  }
  /* The variant fades a solid accent overlay in on hover; this button has no flat state to fade from. */
  &&::before {
    content: none;
  }
`
