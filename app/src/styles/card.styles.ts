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

// The 2px spread lifts the glow clear of the hover ring, which now covers the card's own box edge.
export const ringLit = css`
  box-shadow: 0 0 8px 2px ${colors.brandViolet};
  outline: none;
`

// The stroke straddles the card's edge rather than sitting wholly inside it.
const RING_WIDTH = 3
const RING_OUTSET = 2

/**
 * How far the hover stroke reaches INSIDE the card's box. Exported because anything drawn OVER a hovered
 * card has to keep clear of it: the shared 3D hover preview is position:fixed in the root stacking
 * context, so it is not bound by the card's own clip and would otherwise paint across the stroke
 * (components/HoverPreviewLayer).
 */
export const RING_INSET = RING_WIDTH - RING_OUTSET

// Hover stroke (Figma "Marketplace Cards" hover, 635:789): 3px of the Cerise gradient
// (#ff2d55 → #c640cd). A gradient fill masked down to the ring, since a border can't carry one.
//
// Straddles the card's edge — 2px out, 1px in — like the nav/promo rings. At inset 0 its outer arc landed
// on the same curve as the card's rounded clip, where mask-clip and background-clip multiply into ~25%
// coverage instead of 50%, and the near-white media read through it as a white line outside the border.
// So the host must NOT clip, and rounds its media/footer individually instead.
export const ringHover = css`
  inset: -${RING_OUTSET}px;
  border: 0;
  padding: ${RING_WIDTH}px;
  border-radius: calc(${radius.card} + ${RING_OUTSET}px);
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

// A card's lit state paints outside its box — 2px of ring plus ~10px of glow, times the 1.025 zoom, so
// just over 16px around a 300px card. An overflow-x rail clips the y axis too, so the room has to be
// PADDING (a negative margin would only move the clip); the negative margin-left then re-aligns the first
// card with the section title, letting the glow spill into the page gutter.
const RAIL_GUTTER = 18

export const railGutter = css`
  padding: ${RAIL_GUTTER}px;
  margin-left: -${RAIL_GUTTER}px;
  scroll-padding-inline: ${RAIL_GUTTER}px;
`
