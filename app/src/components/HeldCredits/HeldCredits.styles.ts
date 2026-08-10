import styled from '@emotion/styled'
import { keyframes } from '@emotion/react'
import { theme } from '~/styles/theme'

const { colors, radius, font } = theme

export const Root = styled.div`
  position: relative;
  display: flex;
  align-items: center;
`

/* Deliberately a pulse and not a spinner: a spinner promises a short, determinate wait, and this one can
   run for as long as the chain takes. The chip has to catch the eye without implying something broke. */
const breathe = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.55; }
`

export const Trigger = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  /* Same 40px box and 0/16 padding as GET CREDITS and the search field it sits between: a control half the
     height of its neighbours reads as a stray tag rather than part of the row — and at 13px the currency
     mark beside the figure was too small to be legible as one. */
  height: 40px;
  padding: 0 16px;
  border: 0;
  border-radius: ${radius.pill};
  background: ${colors.promptAmber};
  color: ${colors.blackBtn};
  font-family: ${font.sans};
  font-size: 14px;
  font-weight: 600;
  line-height: 1;
  cursor: pointer;
  white-space: nowrap;

  &:hover {
    filter: brightness(0.97);
  }

  /* Only the clock breathes. Animating the label would make the number hard to read at a glance, and the
     number is the part the buyer actually needs. */
  [data-held-clock] {
    animation: ${breathe} 1.8s ease-in-out infinite;
  }

  /* Respect a reduced-motion preference — this is decoration, not information. */
  @media (prefers-reduced-motion: reduce) {
    [data-held-clock] {
      animation: none;
    }
  }
`

export const Panel = styled.div`
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: ${theme.z.tooltip};
  width: 268px;
  padding: 14px;
  border-radius: ${radius.modal};
  background: ${colors.white};
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
  font-family: ${font.sans};
  color: ${colors.blackBtn};
  text-align: left;
`

export const Title = styled.p`
  margin: 0 0 6px;
  font-size: 14px;
  font-weight: 700;
`

export const Body = styled.p`
  margin: 0 0 10px;
  font-size: 13px;
  line-height: 1.45;
`

/* The countdown itself. Tabular figures so the seconds ticking down do not shift the text around it. */
export const Countdown = styled.span`
  font-variant-numeric: tabular-nums;
  font-weight: 700;
`

export const Caveat = styled.p`
  margin: 0;
  font-size: 12px;
  line-height: 1.4;
  color: ${colors.blackBtn};
  opacity: 0.65;
`
