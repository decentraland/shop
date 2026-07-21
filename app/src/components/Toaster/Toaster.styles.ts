import styled from '@emotion/styled'
import { keyframes } from '@emotion/react'
import { theme } from '~/styles/theme'

const toastIn = keyframes`
  from {
    opacity: 0;
    transform: translateX(24px) scale(0.96);
  }
  to {
    opacity: 1;
    transform: translateX(0) scale(1);
  }
`

// The fixed, top-right stack that holds the live toasts.
export const List = styled.div`
  position: fixed;
  top: 18px;
  right: 18px;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: min(92vw, 380px);
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
  background: ${theme.colors.accent};

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
// Info keeps the base accent; success/error deepen to their solid status shades.
export const Item = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 13px 16px;
  border-radius: ${theme.radius.card};
  background: ${theme.colors.white};
  color: ${theme.colors.text};
  box-shadow: 0 12px 32px rgba(20, 20, 30, 0.18);
  cursor: pointer;
  border-left: 4px solid ${theme.colors.accent};
  animation: ${toastIn} 0.28s cubic-bezier(0.2, 0.9, 0.3, 1.2);

  &[data-kind='success'] {
    border-left-color: ${theme.colors.okStrong};
  }
  &[data-kind='error'] {
    border-left-color: ${theme.colors.errStrong};
  }

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`
