import styled from '@emotion/styled'
import { Button } from '~/components/Button'
import { theme } from '~/styles/theme'

const { colors, gradients, media, radius } = theme

/**
 * The event's banner strip, above its grid.
 *
 * Shorter than the home hero on purpose: this one sits over a filter sidebar and a grid rather than
 * opening a page, so it announces the event without pushing the items below the fold.
 */
export const Banner = styled.section`
  position: relative;
  display: flex;
  align-items: center;
  aspect-ratio: 1920 / 220;
  max-height: 220px;
  margin-bottom: 28px;
  overflow: hidden;
  border-radius: ${radius.banner};
  background: #14161b;

  ${media.maxWidth('mobile')} {
    aspect-ratio: 390 / 200;
    max-height: none;
    border-radius: 0;
    /* Out to the window edges, the way the home hero runs: a rounded inset strip at this width reads as a
       widget rather than as the page's header. */
    width: 100vw;
    margin-inline: calc(50% - 50vw);
    padding-inline: calc(50vw - 50%);
    justify-content: center;
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
  padding-inline: 40px;

  ${media.maxWidth('mobile')} {
    align-items: center;
    text-align: center;
    padding-inline: 16px;
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
