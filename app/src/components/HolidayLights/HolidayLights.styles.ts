import { keyframes } from '@emotion/react'
import styled from '@emotion/styled'

/** Tall enough for the deepest sag plus a hanging bulb and its glow. */
export const HEIGHT_PX = 44

// Mostly lit, with a short dip: a string of lights that spends half its time dark reads as broken, not as
// twinkling.
const twinkle = keyframes`
  0%, 62%, 100% {
    opacity: 1;
  }
  74% {
    opacity: 0.35;
  }
  86% {
    opacity: 0.9;
  }
`

/**
 * Hung from the bottom edge of the bar it is mounted in, full width, and never in the way: it draws over the
 * top of the page below but takes no clicks.
 */
export const String = styled.div`
  position: absolute;
  left: 0;
  right: 0;
  top: 100%;
  height: ${HEIGHT_PX}px;
  overflow: hidden;
  pointer-events: none;

  svg {
    display: block;
    overflow: visible;
  }

  /* The pages that keep a plain field are the working ones, and so is this: no decoration there. */
  html[data-campaign-field='plain'] & {
    display: none;
  }
`

export const Wire = styled.path`
  fill: none;
  stroke: #0d3b25;
  stroke-width: 2;
`

export const Socket = styled.rect`
  fill: #1a5a3a;
`

export const Bulb = styled.g`
  fill: var(--bulb);
  filter: drop-shadow(0 0 4px var(--bulb)) drop-shadow(0 2px 9px var(--bulb));
  animation: ${twinkle} var(--twinkle-s) ease-in-out var(--twinkle-delay) infinite;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`
