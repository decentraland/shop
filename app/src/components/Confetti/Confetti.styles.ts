import styled from '@emotion/styled'

// A full-viewport, non-interactive layer for the burst. `inset: 0` rather than `width: 100vw` so a page
// with a visible scrollbar doesn't gain a horizontal one, and `pointer-events: none` so the confetti can
// never swallow a click on the CTAs it rains over.
export const Layer = styled.div`
  position: fixed;
  inset: 0;
  /**
   * NEGATIVE, and that is the whole trick.
   *
   * This layer renders INSIDE Success's Root, so it shares that stacking context with the card: a positive or
   * zero z-index paints it above every in-flow sibling no matter what the parent's own z-index is, which is
   * why raising Root did nothing. Only a negative value puts a positioned child behind its parent's content.
   *
   * The parent must then form a stacking context (Root sets position/z-index), or -1 would escape past it and
   * hide behind the page background instead.
   */
  z-index: -1;
  pointer-events: none;
`
