import { keyframes } from '@emotion/react'
import styled from '@emotion/styled'

// Emotion's helper rather than a raw @keyframes inside a styled template: the helper guarantees the animation
// name it emits is the one the rule references.
const breathe = keyframes`
  0%, 100% { opacity: 0.6; transform: scale(0.96); }
  50% { opacity: 1; transform: scale(1); }
`

// Owns the whole viewport rather than sitting inside the page shell: the shell renders a NavBar and a footer
// full of links into a Shop that is closed, so this replaces it instead of living in it.
// Fixed to the viewport rather than min-height'd: as a min-height block it stacked with the document's own
// box and the page scrolled a few pixels, which on a single-screen holding page reads as a rendering bug.
// `inset: 0` makes it exactly the viewport, and `overflow: hidden` means there is nothing to scroll at all.
// 100dvh over 100vh so mobile browser chrome doesn't push it taller than the visible area.
export const Wrapper = styled.div`
  position: fixed;
  inset: 0;
  height: 100dvh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 32px 24px;
  text-align: center;

  /* Decentraland's brand warmth, at a fraction of full strength: two soft radial washes in the mark's own
     coral and amber, plus the accent purple, over white. Strong enough that the page reads as designed rather
     than as a bare error screen; faint enough that black body copy stays legible on top without a card. */
  background:
    radial-gradient(60% 55% at 18% 22%, rgba(255, 45, 85, 0.13) 0%, rgba(255, 45, 85, 0) 70%),
    radial-gradient(55% 50% at 84% 20%, rgba(255, 201, 91, 0.16) 0%, rgba(255, 201, 91, 0) 70%),
    radial-gradient(70% 60% at 50% 108%, rgba(105, 31, 169, 0.14) 0%, rgba(105, 31, 169, 0) 72%),
    #ffffff;
`

export const LogoRing = styled.div`
  display: grid;
  place-items: center;
  width: 112px;
  height: 112px;
  border-radius: 50%;
  /* The DCL mark's outer ring is #FCFCFC, so on a white page it dissolves into the background and only the
     small coloured shapes inside survive. A faint tinted disc gives the ring something to sit on. */
  background: rgba(0, 0, 0, 0.04);
  animation: ${breathe} 3s ease-in-out infinite;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`

// An <img> rather than a CSS background: if the asset ever fails to resolve, a broken image is visible and
// gets fixed, while a background silently renders nothing — which is exactly how this went unnoticed.
export const Logo = styled.img`
  width: 64px;
  height: 64px;
  display: block;
`

export const Title = styled.h1`
  margin: 0;
  font-size: 24px;
  font-weight: 600;
`

export const Body = styled.p`
  margin: 0;
  max-width: 42ch;
  opacity: 0.75;
  line-height: 1.5;
`

export const Hint = styled.p`
  margin: 0;
  max-width: 42ch;
  font-size: 13px;
  opacity: 0.55;
`
