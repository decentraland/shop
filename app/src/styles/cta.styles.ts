import { css } from '@emotion/react'
import { theme } from '~/styles/theme'

const { colors, font, gradients, radius } = theme

/**
 * The checkout CTA pair: `primary` advances (the buy gradient, solid red on hover) and `glass` dismisses
 * (translucent white on the dark cart drawer). Every surface that ends in "check out" draws the same pair.
 *
 * The hover keeps the fill on `background-image`: a gradient cannot interpolate to a plain colour, so
 * setting `background` there blanks the button mid-transition.
 */
export const checkoutCtaCss = css`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 46px;
  padding: 0 12px;
  border-radius: ${radius.cta};
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
  &[data-variant='glass'] {
    border: 0;
    background: ${colors.glass};
    color: ${colors.softWhite};
  }

  @media (hover: hover) {
    &[data-variant='primary']:hover {
      background-image: linear-gradient(${colors.dclRed}, ${colors.dclRed});
    }
    &[data-variant='glass']:hover {
      background: ${colors.glassStrong};
    }
  }
  &[data-variant='primary']:active {
    background-image: linear-gradient(${colors.dclRed}, ${colors.dclRed});
  }
`

/**
 * The buy-credits CTA (the nav's GET CREDITS, the home hero, the live promo tile): the BUY Button gradient
 * that flattens to solid red on hover/press and grows an orange ring just outside the button. Geometry
 * (height, padding, type size) stays with each surface.
 */
export const creditsCtaCss = css`
  position: relative;
  background: ${gradients.buyBtn};
  color: ${colors.white};

  &::after {
    content: '';
    position: absolute;
    inset: -3px;
    border: 2px solid ${colors.orange};
    border-radius: calc(${radius.cta} + 2px);
    opacity: 0;
    transition: opacity 0.15s ease;
    pointer-events: none;
  }
  @media (hover: hover) {
    &:hover {
      background-image: linear-gradient(${colors.dclRed}, ${colors.dclRed});
    }
    &:hover::after {
      opacity: 1;
    }
  }
  &:active {
    background-image: linear-gradient(${colors.dclRed}, ${colors.dclRed});
  }
  &:active::after {
    opacity: 1;
  }
`
