import styled from '@emotion/styled'
import { keyframes } from '@emotion/react'
import { theme } from '~/styles/theme'

const { colors, radius, z } = theme

const popIn = keyframes`
  0% {
    transform: scale(0);
    opacity: 0;
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
`

// Flex + `margin: auto` on the modal rather than grid centering: centred alignment overflows equally in
// both directions, so a modal taller than the viewport puts its own top above the scroll origin, where
// nothing can scroll it back. Same reason the checkout shell does it this way (components/BuyModal).
export const Backdrop = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  overflow-y: auto;
  padding: 20px;
  // Above the global DCL navbar so the backdrop dims the full viewport (navbar included).
  z-index: ${z.overlay};
`

// data-success centers the layout for the post-listing confirmation view.
export const Modal = styled.div`
  background: ${colors.white};
  border-radius: ${radius.card};
  padding: 24px;
  width: min(420px, 92vw);
  margin: auto;
  /* Never taller than the (padded) viewport, and scroll inside if the content still does not fit — on a
     short screen the actions used to sit off the bottom edge with no way to reach them. */
  max-height: 100%;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;

  &[data-success] {
    text-align: center;
    align-items: center;
  }
  &[data-success] [data-actions] {
    justify-content: center;
    width: 100%;
  }
`

export const Title = styled.h2`
  font-size: 20px;
`

export const Img = styled.img`
  width: 140px;
  height: 140px;
  object-fit: contain;
  align-self: center;
  background: ${colors.media};
  border-radius: 10px;
`

// Pinned to the bottom of the (scrollable) modal so the primary action stays reachable when the content
// above it outgrows a short screen. The white fill hides whatever scrolls underneath.
export const Actions = styled.div`
  position: sticky;
  bottom: 0;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 6px;
  padding-top: 8px;
  background: ${colors.white};
`

export const SuccessCheck = styled.div`
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: ${colors.okStrong};
  color: ${colors.white};
  font-size: 30px;
  font-weight: 800;
  display: grid;
  place-items: center;
  margin: 4px auto 2px;
  animation: ${popIn} 0.32s cubic-bezier(0.2, 0.9, 0.3, 1.4);

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`

export const SuccessName = styled.p`
  font-weight: 700;
  font-size: 16px;
  margin: 2px 0 0;
`
