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

/**
 * How thick the hover stroke is. Exported because anything drawn OVER a hovered card has to keep clear of
 * it: the shared 3D hover preview is position:fixed in the root stacking context, so it is not bound by
 * the card's own clip and would otherwise paint across the stroke (components/HoverPreviewLayer).
 */
export const RING_WIDTH = 3

// How far the ring's own box is pushed OUTSIDE the card, so its own corner arc is nowhere near the card's
// clip. Any smaller and the two arcs still overlap along the corner, which is the whole point below.
const BLEED = 4

/**
 * Hover stroke (Figma "Marketplace Cards" hover, 635:789): 3px of the Cerise gradient (#ff2d55 → #c640cd).
 * A gradient fill masked down to the ring, since a border can't carry one.
 *
 * The box is deliberately BIGGER than the card and let the card's own `overflow: hidden` cut it back, so
 * the visible outer edge is drawn by the clip and nothing else.
 *
 * Sitting flush at inset 0 left a pale line along the outside of the stroke, over the media and never over
 * the footer. The ring was antialiased TWICE there — by its own border-radius and again by the card's clip,
 * both on the same 12px arc — so its coverage in the boundary pixel was the product of the two, while the
 * light media beneath passed through the clip only once. The ring could not fill what the clip let through,
 * and the difference read as a bright edge; over the dark footer the same gap has nothing bright to show.
 *
 * With the arc pushed clear, the ring's edge and the media's edge are the same rasterisation and cannot
 * disagree. The padding carries the bleed so the visible band is still RING_WIDTH.
 */
export const ringHover = css`
  inset: -${BLEED}px;
  border: 0;
  padding: ${BLEED + RING_WIDTH}px;
  border-radius: calc(${radius.card} + ${BLEED}px);
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
