import styled from '@emotion/styled'
import { keyframes } from '@emotion/react'
import { theme } from '~/styles/theme'
import { darkCard } from '~/styles/darkSurface'

const toastIn = keyframes`
  from {
    opacity: 0;
    transform: translateY(-12px) scale(0.96);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
`

// The fixed stack that holds the live toasts: top centre, just below the navbar. Top tier, so a toast
// fired from inside a modal shows over its scrim. The list itself lets clicks through to the page.
export const List = styled.div`
  position: fixed;
  top: calc(var(--nav-h) + 12px);
  left: 0;
  right: 0;
  z-index: ${theme.z.tooltip};
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  pointer-events: none;

  & > * {
    pointer-events: auto;
    max-width: min(92vw, 380px);
  }
`

export const Icon = styled.span`
  flex: 0 0 22px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: ${theme.colors.white};
  font-weight: 800;
  font-size: 13px;
  background: ${theme.colors.magenta};

  &[data-kind='success'] {
    background: ${theme.colors.okStrong};
  }
  &[data-kind='error'] {
    background: ${theme.colors.errStrong};
  }
`

export const Msg = styled.span`
  font-size: 14px;
  font-weight: 600;
  line-height: 1.35;
`

// A single toast. The kind (success / error / info) rides on data-kind — the same hook tests would
// assert on — and drives both the left border and the icon fill, so no style-only prop reaches the DOM.
// The edge uses the light status shades: the solid ones the icons fill with sink into the dark card.
export const Item = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 13px 16px;
  ${darkCard}
  border-radius: ${theme.radius.card};
  cursor: pointer;
  border-left: 4px solid ${theme.colors.magenta};
  animation: ${toastIn} 0.28s cubic-bezier(0.2, 0.9, 0.3, 1.2);

  &[data-kind='success'] {
    border-left-color: ${theme.colors.successBorder};
  }
  &[data-kind='error'] {
    border-left-color: ${theme.colors.dclRed};
  }

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`
