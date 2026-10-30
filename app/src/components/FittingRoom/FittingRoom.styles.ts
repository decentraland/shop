import styled from '@emotion/styled'
import { keyframes } from '@emotion/react'
import { theme } from '~/styles/theme'
import { checkoutCtaCss } from '~/styles/cta.styles'
import { CurrencyIcon } from '~/components/CurrencyIcon'
import { dark, darkCard } from '~/styles/darkSurface'

const { colors, radius, media, z } = theme

const fadeIn = keyframes`
  from { opacity: 0; }
  to { opacity: 1; }
`

export const Modal = styled.div`
  position: fixed;
  inset: 0;
  // Above the global DCL navbar so the scrim dims the full viewport (navbar included).
  z-index: ${z.overlay};
  display: grid;
  place-items: center;
  padding: 20px;
`

export const Scrim = styled.div`
  position: absolute;
  inset: 0;
  background: rgba(22, 21, 24, 0.5);
  animation: ${fadeIn} 0.16s ease;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`

// cart-pop-in is a global keyframe (index.css).
export const Panel = styled.div`
  position: relative;
  z-index: 1;
  display: flex;
  width: 100%;
  max-width: 1000px;
  height: min(88vh, 720px);
  ${darkCard}
  border-radius: ${radius.banner};
  overflow: hidden;
  animation: cart-pop-in 0.18s ease;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
  ${media.maxWidth('md')} {
    flex-direction: column;
    height: min(92vh, 860px);
  }
`

export const Close = styled.button`
  position: absolute;
  top: 12px;
  right: 14px;
  z-index: 3;
  width: 34px;
  height: 34px;
  border: 0;
  border-radius: 50%;
  background: ${colors.glassFaint};
  color: ${colors.softWhite};
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
  display: grid;
  place-items: center;

  &:hover {
    background: ${colors.glass};
  }
`

// Violet gradient = the AnimatedBackground's resting look + the fallback while its WebGL chunk loads.
export const Stage = styled.div`
  position: relative;
  flex: 1;
  min-width: 0;
  background: radial-gradient(circle at 50% 45%, #bf00ff 0%, #510884 78%);

  /* The transparent avatar iframe sits ABOVE the absolute AnimatedBackground. */
  & iframe {
    position: relative;
    z-index: 1;
    width: 100%;
    height: 100%;
    border: 0;
    display: block;
  }

  ${media.maxWidth('md')} {
    height: 44vh;
    flex: none;
  }
`

export const EmptyStage = styled.div`
  position: absolute;
  inset: 0;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  text-align: center;
  padding: 20px;
  color: ${colors.white};

  & .muted {
    color: rgba(255, 255, 255, 0.75);
  }
`

export const Loading = styled.div`
  position: absolute;
  inset: 0;
  z-index: 2;
  display: grid;
  place-items: center;
  pointer-events: none;
`

// spin is a global keyframe (index.css).
export const Spinner = styled.span`
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: 3px solid rgba(255, 255, 255, 0.3);
  border-top-color: ${colors.white};
  animation: spin 0.8s linear infinite;

  @media (prefers-reduced-motion: reduce) {
    animation-duration: 2s;
  }
`

export const Side = styled.div`
  width: 380px;
  flex: none;
  display: flex;
  flex-direction: column;
  border-left: 1px solid ${dark.hairline};

  ${media.maxWidth('md')} {
    width: 100%;
    border-left: 0;
    border-top: 1px solid ${dark.hairline};
    min-height: 0;
  }
`

export const Head = styled.div`
  padding: 20px 20px 12px;
  border-bottom: 0.5px solid ${dark.rule};
`

export const Title = styled.h2`
  font-size: 20px;
  font-weight: 800;
  margin: 0 0 4px;
`

export const Sub = styled.p`
  font-size: 13px;
  margin: 0;
`

export const Items = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 8px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
`

export const Row = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px;
  border-radius: 12px;
  border: 1px solid transparent;

  &[data-on] {
    background: ${colors.glassFaint};
    border-color: ${dark.hairline};
  }
  &[data-incompatible] {
    opacity: 0.5;
  }
`

export const Toggle = styled.label`
  flex: none;
  display: grid;
  place-items: center;

  & input {
    position: absolute;
    opacity: 0;
    width: 0;
    height: 0;
  }
  & input:checked + [data-box] {
    cursor: pointer;
    background: ${colors.softWhite};
    border-color: ${colors.softWhite};
  }
  & input:checked + [data-box]::after {
    cursor: pointer;
    opacity: 1;
  }
  & input:disabled + [data-box] {
    visibility: hidden;
  }
`

export const Box = styled.span`
  width: 22px;
  height: 22px;
  border-radius: 6px;
  border: 2px solid ${colors.glassRing};
  background: transparent;
  display: grid;
  place-items: center;
  transition:
    background 0.12s ease,
    border-color 0.12s ease;

  &::after {
    content: '✓';
    color: ${colors.fieldBottomWashed};
    font-size: 14px;
    font-weight: 800;
    opacity: 0;
  }
`

export const Thumb = styled.div`
  width: 48px;
  height: 48px;
  flex: none;
  border-radius: 10px;
  overflow: hidden;
  background: ${dark.raised};

  & img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
`

export const Info = styled.div`
  flex: 1;
  min-width: 0;
`

export const Name = styled.div`
  font-weight: 600;
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`

export const Meta = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 3px;
`

export const Conflict = styled.span`
  font-size: 10px;
  font-weight: 700;
  color: ${colors.nameLink};
  background: ${colors.glassFaint};
  border-radius: 5px;
  padding: 1px 6px;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  white-space: nowrap;
`

export const Incompat = styled.span`
  font-size: 10px;
  font-weight: 700;
  color: ${colors.flareAmber};
  background: rgba(255, 188, 91, 0.12);
  border-radius: 5px;
  padding: 1px 6px;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  white-space: nowrap;
`

export const Price = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-weight: 700;
  font-size: 14px;
  color: ${colors.softWhite};
  flex: none;
`

export const Diamond = styled(CurrencyIcon)`
  width: 13px;
  height: 13px;
  color: ${colors.softWhite};
`

export const Remove = styled.button`
  flex: none;
  border: 0;
  background: none;
  color: ${colors.glassText};
  cursor: pointer;
  padding: 6px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  transition:
    color 0.12s ease,
    background 0.12s ease;

  &:hover {
    color: ${dark.errorText};
    background: rgba(255, 45, 85, 0.16);
  }
`

// Figma's CTA block (2187:451726): the total on its own row with the button full-width under it, not the
// two side by side. A checkout button that hugs its label reads as a secondary action next to the figure.
export const Foot = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px 20px;
  border-top: 0.5px solid ${dark.rule};
`

export const Total = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 14px;
  color: ${colors.glassText};

  & strong {
    color: ${colors.softWhite};
  }

  /* The credit mark sits inline with the figure, so it takes the text's own colour and rides its baseline
     rather than the line box's top. */
  & .ico {
    width: 14px;
    height: 14px;
    vertical-align: -2px;
  }
`

// The same button the cart drawer ends on — checking out looks like checking out wherever it is offered.
// It used to be the purple Button variant, which read as a different, lesser action than the real one.
export const CheckoutBtn = styled.button`
  ${checkoutCtaCss};
  width: 100%;
`
