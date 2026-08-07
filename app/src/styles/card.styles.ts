import { css } from '@emotion/react'
import { theme } from '~/styles/theme'

const { colors, gradients, radius } = theme

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

// Hover stroke (Figma "Marketplace Cards" hover, 635:789): 3px of the Cerise gradient
// (#ff2d55 → #c640cd). A gradient fill masked down to the ring, since a border can't carry one.
//
// It deliberately overhangs the card by 1px and lets the card's own `overflow: hidden` cut it back.
// Sitting flush at inset 0 left a pale hairline along the OUTSIDE of the stroke: the card's rounded clip
// and this element's own rounded background are two separate rasterisations of the same 12px arc, and
// Chrome does not give them identical coverage — wherever the clip won by a fraction of a pixel, the light
// media underneath showed past the stroke. Overhanging makes the CLIP the thing that draws the outer edge,
// so the stroke and the media it covers are bounded by one and the same arc and cannot disagree. The
// padding carries the extra pixel so the visible band stays 3px.
export const ringHover = css`
  inset: -1px;
  border: 0;
  padding: 4px;
  // Concentric with the card's own corner, so the overhang is an even 1px the whole way round.
  border-radius: calc(${radius.card} + 1px);
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
