import styled from '@emotion/styled'
import { keyframes } from '@emotion/react'
import { theme } from '~/styles/theme'
import { Button } from '~/components/Button'
import { CurrencyIcon } from '~/components/CurrencyIcon'

const { colors, radius, media } = theme

const fadeIn = keyframes`
  from { opacity: 0; }
  to { opacity: 1; }
`

export const Modal = styled.div`
  position: fixed;
  inset: 0;
  z-index: 70;
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
  background: #fff;
  border-radius: ${radius.banner};
  overflow: hidden;
  box-shadow: 0 24px 60px rgba(22, 21, 24, 0.3);
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
  background: rgba(255, 255, 255, 0.9);
  color: ${colors.text};
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
  display: grid;
  place-items: center;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.15);
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
  color: #fff;

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
  border-top-color: #fff;
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
  border-left: 1px solid ${colors.line};

  ${media.maxWidth('md')} {
    width: 100%;
    border-left: 0;
    border-top: 1px solid ${colors.line};
    min-height: 0;
  }
`

export const Head = styled.div`
  padding: 20px 20px 12px;
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
    background: ${colors.rarityBg};
  }
  &[data-incompatible] {
    opacity: 0.5;
  }
`

export const Toggle = styled.label`
  flex: none;
  cursor: pointer;
  display: grid;
  place-items: center;

  & input {
    position: absolute;
    opacity: 0;
    width: 0;
    height: 0;
  }
  & input:checked + [data-box] {
    background: ${colors.accent};
    border-color: ${colors.accent};
  }
  & input:checked + [data-box]::after {
    opacity: 1;
  }
  & input:disabled + [data-box] {
    opacity: 0.4;
    cursor: not-allowed;
  }
`

export const Box = styled.span`
  width: 22px;
  height: 22px;
  border-radius: 6px;
  border: 2px solid ${colors.lineStrong};
  background: #fff;
  display: grid;
  place-items: center;
  transition:
    background 0.12s ease,
    border-color 0.12s ease;

  &::after {
    content: '✓';
    color: #fff;
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
  background: ${colors.media};

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
  color: ${colors.accent};
  background: rgba(105, 31, 169, 0.12);
  border-radius: 5px;
  padding: 1px 6px;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  white-space: nowrap;
`

export const Incompat = styled.span`
  font-size: 10px;
  font-weight: 700;
  color: #9a6100;
  background: rgba(214, 158, 46, 0.18);
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
  color: ${colors.text2};
  flex: none;
`

export const Diamond = styled(CurrencyIcon)`
  width: 13px;
  height: 13px;
  color: ${colors.text2};
`

export const Remove = styled.button`
  flex: none;
  border: 0;
  background: none;
  color: ${colors.muted2};
  cursor: pointer;
  padding: 6px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  transition:
    color 0.12s ease,
    background 0.12s ease;

  &:hover {
    color: ${colors.dclRed};
    background: rgba(255, 45, 85, 0.1);
  }
`

export const Foot = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 20px;
  border-top: 1px solid ${colors.line};
`

export const Total = styled.div`
  font-size: 14px;
  color: ${colors.text2};
`

export const CheckoutBtn = styled(Button)`
  flex: none;
`
