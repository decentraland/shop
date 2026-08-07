import { css } from '@emotion/react'
import { theme } from '~/styles/theme'

const { colors, font, gradients, radius } = theme

/**
 * The checkout CTA pair (Figma 2187:453378 / 453391, and the add-to-cart drawer 2250:271335).
 *
 * `data-variant='primary'` is the advancing action — the BUY Button gradient, flattening to solid red on
 * hover. `data-variant='secondary'` is the dismissing one beside it — a hairline soft-black outline.
 *
 * Shared rather than restated per surface: every place that ends in "check out" draws the SAME button, and
 * the fitting room's used to be the purple Button variant instead, which read as a different action.
 *
 * Note the hover keeps the fill on `background-image`: a gradient cannot interpolate to a plain colour, so
 * setting `background` there blanks the button mid-transition.
 */
export const checkoutCtaCss = css`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 46px;
  padding: 0 12px;
  border-radius: ${radius.card};
  font-family: ${font.sans};
  font-size: 13px;
  font-weight: 600;
  line-height: 24px;
  letter-spacing: 0.46px;
  text-transform: uppercase;
  text-decoration: none;
  cursor: pointer;

  &[data-variant='primary'] {
    border: 0;
    background: ${gradients.buyBtn};
    color: ${colors.white};
  }
  &[data-variant='primary']:hover,
  &[data-variant='primary']:active {
    background-image: linear-gradient(${colors.dclRed}, ${colors.dclRed});
  }
  &[data-variant='secondary'] {
    border: 0.5px solid ${colors.text};
    background: ${colors.white};
    color: ${colors.text};
  }
  /* Figma's outlined hover (738:53251): the fill inverts to soft-black-2 with a soft-white label. The
     white-fill hover the dark-field buttons take would be invisible on this light drawer. */
  &[data-variant='secondary']:hover {
    background: ${colors.text2};
    color: ${colors.softWhite};
  }
`
