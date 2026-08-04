import styled from '@emotion/styled'

// A full-viewport, non-interactive layer for the burst. `inset: 0` rather than `width: 100vw` so a page
// with a visible scrollbar doesn't gain a horizontal one, and `pointer-events: none` so the confetti can
// never swallow a click on the CTAs it rains over.
export const Layer = styled.div`
  position: fixed;
  inset: 0;
  z-index: 1;
  pointer-events: none;
`
