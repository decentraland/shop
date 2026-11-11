import { keyframes } from '@emotion/react'
import styled from '@emotion/styled'

// One keyframe for every heading: the start and end points are handed in as custom properties, so a
// flight can run along any vector instead of the two horizontal ones this used to have.
const cross = keyframes`
  from {
    transform: translate3d(var(--x1), var(--y1), 0);
  }
  to {
    transform: translate3d(var(--x2), var(--y2), 0);
  }
`

// A dead-straight line across the screen reads as a sprite on rails. This is the whole illusion.
// --tilt banks the bat into its heading, so a steep climb or dive is not flown flat.
const bob = keyframes`
  from {
    transform: translate3d(0, -14px, 0) rotate(calc(var(--tilt) - 4deg));
  }
  to {
    transform: translate3d(0, 14px, 0) rotate(calc(var(--tilt) + 4deg));
  }
`

/**
 * The full-viewport, non-interactive layer one bat crosses at a time.
 *
 * BEHIND the page's content, like the drifting tile: the bat passes under the cards, the preview and the
 * buttons, and is seen only through the gaps. `-1` puts it behind the in-flow content of the root
 * stacking context while still painting over the page field, which is the canvas and cannot be occluded.
 * It works only for as long as nothing between here and <body> forms a stacking context.
 */
export const Layer = styled.div`
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  overflow: hidden;
`

export const Flight = styled.div`
  position: absolute;
  left: 50%;
  top: 50%;
  width: var(--bat-size);
  height: var(--bat-size);
  animation: ${cross} var(--bat-seconds) linear forwards;
`

export const Bob = styled.div`
  width: 100%;
  height: 100%;
  opacity: 0.85;
  animation: ${bob} 2.4s ease-in-out infinite alternate;

  /* The artwork's own pure black, kept. It reads as a true silhouette over the light item cards and the
     hero artwork; over the darkest parts of the field it all but disappears, which is why it carries a
     faint pumpkin rim rather than nothing at all. */
  filter: drop-shadow(0 0 7px rgba(255, 122, 24, 0.5));

  /* The artwork faces one way; travelling the other way without this is a bat flying backwards. Applied
     to the INNER element so it cannot fight the crossing transform on the parent. */
  &[data-facing='left'] {
    scale: -1 1;
  }
`
