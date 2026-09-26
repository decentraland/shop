import { keyframes } from '@emotion/react'
import styled from '@emotion/styled'

// Out from the centre along a per-bat vector, tumbling and fading. The translate keeps its own -50%
// centring offset in both stops, so the bat leaves from the anchor rather than from its own top-left.
const scatter = keyframes`
  from {
    transform: translate3d(-50%, -50%, 0) scale(0.25) rotate(0deg);
    opacity: 0;
  }
  18% {
    opacity: 1;
  }
  to {
    transform: translate3d(calc(-50% + var(--dx)), calc(-50% + var(--dy)), 0) scale(var(--scale))
      rotate(var(--rot));
    opacity: 0;
  }
`

/**
 * Anchored to the centre of whatever the burst decorates, and deliberately zero-sized: the bats are
 * absolutely positioned against this point, so it can sit inside a button without affecting its layout.
 */
export const Origin = styled.span`
  position: absolute;
  left: 50%;
  top: 50%;

  /* Moved onto the container's own edge, so the bats leave from the side rather than from the middle. */
  &[data-from='left'] {
    left: 0;
  }
  &[data-from='right'] {
    left: 100%;
  }
  width: 0;
  height: 0;
  pointer-events: none;
  /* Above the card's own content but far below the overlay tier, so a burst can never cover a dialog. */
  z-index: 5;
`

export const Bat = styled.img`
  position: absolute;
  left: 0;
  top: 0;
  width: var(--size);
  height: var(--size);
  will-change: transform, opacity;
  /* The artwork is pure black, and half the bats land on the dark page rather than on the bright card.
     The same pumpkin rim the flying one carries, so they stay readable either way. */
  filter: drop-shadow(0 0 3px rgba(255, 122, 24, 0.7));
  animation: var(--dur) cubic-bezier(0.2, 0.7, 0.35, 1) var(--delay) both ${scatter};
`
