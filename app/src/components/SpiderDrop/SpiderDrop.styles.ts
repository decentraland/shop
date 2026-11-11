import { keyframes } from '@emotion/react'
import styled from '@emotion/styled'

/**
 * The climb back up.
 *
 * The clip itself only descends: measured, the spider drops over its first ~0.8s and then hangs for the
 * remaining five, with no retract. Left to a timeout it would simply blink out of existence, so the
 * ANCHOR is pulled up behind the sub-nav at the end and the spider goes back the way it came.
 */
const visit = keyframes`
  0%,
  76% {
    transform: translateY(0);
  }
  100% {
    transform: translateY(-105%);
  }
`

/**
 * The spider hangs from the sub-nav, so `top` is set from JS to that bar's measured bottom edge — it is
 * not a fixed height across breakpoints (see subnavBottom).
 *
 * z-index sits BELOW the sub-nav (40) and above the page, which is the whole trick: the thread appears to
 * come out from behind the tabs instead of being drawn on top of them.
 */
export const Anchor = styled.div`
  position: fixed;
  width: var(--spider-size);
  height: var(--spider-size);
  z-index: 35;
  pointer-events: none;
  animation: ${visit} var(--visit-ms) ease-in both;
`

export const Body = styled.div`
  width: 100%;
  height: 100%;
  /* Pure black artwork on a dark page, the same problem the bats have and the same rim as the answer. */
  filter: drop-shadow(0 0 8px rgba(255, 122, 24, 0.45));
`
