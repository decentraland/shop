import styled from '@emotion/styled'
import { keyframes } from '@emotion/react'
import { theme } from '~/styles/theme'

// The ring/check draw-in green is specific to this success animation — not reused anywhere else, so it
// stays a local literal rather than a shared token.
const drawGreen = '#2bb673'

const saDraw = keyframes`
  to {
    stroke-dashoffset: 0;
  }
`
const saPop = keyframes`
  0% {
    transform: scale(0.85);
  }
  60% {
    transform: scale(1.04);
  }
  100% {
    transform: scale(1);
  }
`
const saSpark = keyframes`
  0% {
    opacity: 0;
    transform: scale(0.3);
  }
  55% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    transform: scale(1.2) translateY(-10px);
  }
`

export const Root = styled.div`
  position: relative;
  width: 92px;
  height: 92px;
`

export const Svg = styled.svg`
  width: 92px;
  height: 92px;
  animation: ${saPop} 0.45s ease;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`

export const Ring = styled.circle`
  fill: none;
  stroke: ${drawGreen};
  stroke-width: 6;
  stroke-linecap: round;
  stroke-dasharray: 339;
  stroke-dashoffset: 339;
  animation: ${saDraw} 0.6s ease forwards;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
    stroke-dashoffset: 0;
  }
`

export const Check = styled.path`
  fill: none;
  stroke: ${drawGreen};
  stroke-width: 8;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-dasharray: 80;
  stroke-dashoffset: 80;
  animation: ${saDraw} 0.4s 0.5s ease forwards;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
    stroke-dashoffset: 0;
  }
`

// The four confetti sparks. Position (and, for 2 & 4, the cart-badge violet) ride on data-spark so the
// variant hook doubles as the style selector — no style-only props on the DOM.
export const Spark = styled.span`
  position: absolute;
  opacity: 0;
  font-size: 16px;
  color: ${theme.colors.accent};
  animation: ${saSpark} 0.8s 0.6s ease forwards;

  &[data-spark='1'] {
    top: -4px;
    left: 6px;
  }
  &[data-spark='2'] {
    top: 2px;
    right: -8px;
    color: ${theme.colors.brandViolet};
  }
  &[data-spark='3'] {
    bottom: -2px;
    left: -4px;
  }
  &[data-spark='4'] {
    bottom: 8px;
    right: 4px;
    color: ${theme.colors.brandViolet};
  }

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`
