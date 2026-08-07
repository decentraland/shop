import styled from '@emotion/styled'
import { keyframes } from '@emotion/react'
import { theme } from '~/styles/theme'
import { Icon } from '~/components/Icon'

const { colors, media } = theme

// The overlay chrome (position, pill/bar backgrounds) lives on ItemDetail's `Preview` wrapper, which
// positions these parts via their `data-preview-*` hooks. Here we own only their inner bits: the
// loader spinner, the toggle's buttons/labels, and the neutralized ui2 <EmoteControls> internals.

const spin = keyframes`
  to {
    transform: rotate(360deg);
  }
`

export const Loading = styled.div``

export const Spinner = styled.span`
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: 3px solid ${colors.line};
  border-top-color: ${colors.accent};
  animation: ${spin} 0.8s linear infinite;

  @media (prefers-reduced-motion: reduce) {
    animation-duration: 2.4s;
  }
`

export const Note = styled.p``

export const Toggle = styled.div``

export const ToggleButton = styled.button`
  border: 0;
  background: none;
  cursor: pointer;
  padding: 6px 16px;
  border-radius: 999px;
  font-weight: 600;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: ${colors.muted};
  transition:
    background 0.12s ease,
    color 0.12s ease;

  &[data-active] {
    background: ${colors.text};
    color: ${colors.white};
  }
  &:not([data-active]):hover {
    color: ${colors.text};
  }

  ${media.maxWidth('lg')} {
    padding: 6px 12px;
    border-radius: 0;
    background: ${colors.white};
    color: ${colors.text2};

    &[data-active] {
      background: ${colors.text};
      color: ${colors.white};
    }
    &:first-of-type {
      border-top-left-radius: 999px;
      border-bottom-left-radius: 999px;
    }
    &:last-of-type {
      border-top-right-radius: 999px;
      border-bottom-right-radius: 999px;
    }
  }
`

export const ToggleLabel = styled.span`
  ${media.maxWidth('lg')} {
    display: none;
  }
`

// The mobile icon-only glyph: hidden on desktop (the text label shows instead).
export const ToggleIcon = styled(Icon)`
  display: none;

  ${media.maxWidth('lg')} {
    display: block;
  }
`
