import styled from '@emotion/styled'
import { keyframes } from '@emotion/react'
import { Icon } from '~/components/Icon'
import { theme } from '~/styles/theme'

const { colors, radius } = theme

const pop = keyframes`
  0% { transform: scale(0.6); opacity: 0; }
  60% { transform: scale(1.15); }
  100% { transform: scale(1); opacity: 1; }
`

export const Root = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  border: 0;
  border-radius: ${radius.btn};
  background: none;
  color: ${colors.gray4};
  font: inherit;
  font-size: 14px;
  cursor: pointer;
  transition:
    color 0.15s ease,
    background 0.15s ease;

  &:hover {
    color: ${colors.white};
    background: rgba(255, 255, 255, 0.12);
  }
  &:focus-visible {
    outline: 2px solid ${colors.softWhite};
    outline-offset: 2px;
  }
`

export const Glyph = styled(Icon)`
  flex: none;
  animation: ${pop} 0.22s ease-out;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`
