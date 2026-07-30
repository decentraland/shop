import { css } from '@emotion/react'
import { theme } from '~/styles/theme'

const { colors, gradients } = theme

// 1px of a TRANSLUCENT grey, which is what Figma's "0.25px Gray 3" actually means once rendered — the two
// are not the same thing and confusing them puts the outline 4x too dark.
//
// The width has to be a full pixel whatever Figma states. Below 1px CSS, Chrome keeps the four straight
// edges crisp but spreads the sub-pixel coverage along the corner arc until it disappears: at DPR 3 the
// straight edges measured full-strength while the corner apex read as plain background, so the ring looked
// like four detached lines with the corners eaten.
//
// The colour then has to carry the faintness the sub-pixel width used to. Figma composites its 0.25px
// stroke at 25% coverage, so `cardLine` (Gray 3 @ 25%) lands on the same pixels Figma renders — and being
// translucent it also darkens over the grey media exactly as Figma's does, which a solid grey cannot: the
// nearest solid, `line`, matches the white footer but leaves a third of the contrast over the media, where
// most of the perimeter lives.
export const ringHairline = css`
  content: '';
  position: absolute;
  inset: 0;
  z-index: 5;
  pointer-events: none;
  border: 1px solid ${colors.cardLine};
  border-radius: inherit;
`

export const ringLit = css`
  box-shadow: 0 0 8px 0 ${colors.brandViolet};
  outline: none;
`

export const ringGradient = css`
  border: 0;
  padding: 2px;
  background: ${gradients.cerise};
  -webkit-mask:
    linear-gradient(#000 0 0) content-box,
    linear-gradient(#000 0 0);
  mask:
    linear-gradient(#000 0 0) content-box,
    linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
`
