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
export const Banner = styled.section`
  position: relative;
  display: flex;
  align-items: center;
  aspect-ratio: 1920 / 340;
  max-height: 340px;
  margin-bottom: 32px;
  overflow: hidden;
  background: #14161b;

  /* Out to the window edges, undoing both the page gutter and its max-width at once — the hero's own
     expression, which is correct whether or not the width cap is in effect. No border-radius for the
     same reason the hero has none: rounded corners flush with the window read as a rendering fault. */
  width: 100vw;
  margin-inline: calc(50% - 50vw);
  border-radius: 0;

  /* …and the copy back onto the page's content edge, so the headline starts on the same vertical line as
     the section titles below it. The percentage resolves against the CONTAINING block, not this
     element's 100vw, which is what makes one expression work at every viewport. */
  padding-inline: calc(50vw - 50%);

  /* The hero's mobile frame is a different composition, not a squeeze of the wide one: near-square, with
     the copy centred near the bottom edge. Matched here so one mobile asset also serves both. */
  ${media.maxWidth('mobile')} {
    aspect-ratio: 390 / 389;
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
