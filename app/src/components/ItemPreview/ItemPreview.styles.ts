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
    padding: 9px 13px;
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

// Neutralize the ui2 <EmoteControls> dark-overlay layout and restyle its parts to the shop's light
// playback bar. The bar's chrome + positioning come from ItemDetail's Preview; these descendant rules
// only touch the ui2 internals rendered inside.
export const EmoteControls = styled.div`
  & .MuiBox-root {
    position: static;
    width: 100%;
    margin: 0;
    padding: 0;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  & .MuiButtonBase-root {
    min-width: 0;
    padding: 0;
    margin: 0;
    border-radius: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: none !important;
    box-shadow: none !important;
    color: ${colors.muted};
    flex: 0 0 auto;
    transition:
      background 0.12s ease,
      color 0.12s ease;
  }
  & .MuiButtonBase-root .MuiSvgIcon-root {
    font-size: 20px;
    margin: 0;
  }
  & .MuiBox-root > .MuiButtonBase-root:first-child {
    width: 34px;
    height: 34px;
    background: ${colors.accent} !important;
    color: ${colors.white};
  }
  & .MuiBox-root > .MuiButtonBase-root:first-child:hover {
    background: ${colors.text} !important;
  }
  & .MuiBox-root > input + .MuiButtonBase-root {
    width: 30px;
    height: 30px;
    color: ${colors.muted};
  }
  & .MuiBox-root > input + .MuiButtonBase-root:hover {
    background: ${colors.media} !important;
    color: ${colors.text};
  }
  & input[type='range'] {
    flex: 1 1 auto;
    width: auto;
    min-width: 0;
    height: 4px;
    margin: 0;
    padding: 0;
    -webkit-appearance: none;
    appearance: none;
    background: transparent;
    cursor: pointer;
  }
  & input[type='range']::-webkit-slider-runnable-track {
    height: 4px;
    border-radius: 999px;
    background: ${colors.lineStrong};
  }
  & input[type='range']::-moz-range-track {
    height: 4px;
    border-radius: 999px;
    background: ${colors.lineStrong};
  }
  & input[type='range']::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 13px;
    height: 13px;
    margin-top: -4.5px;
    border-radius: 50%;
    background: ${colors.accent};
    border: 2px solid ${colors.white};
    box-shadow: 0 1px 3px rgba(22, 21, 24, 0.3);
    cursor: pointer;
  }
  & input[type='range']::-moz-range-thumb {
    width: 13px;
    height: 13px;
    border-radius: 50%;
    background: ${colors.accent};
    border: 2px solid ${colors.white};
    box-shadow: 0 1px 3px rgba(22, 21, 24, 0.3);
    cursor: pointer;
  }
  & input[type='range']:focus-visible {
    outline: none;
  }
  & input[type='range']:focus-visible::-webkit-slider-thumb {
    outline: 2px solid ${colors.accent};
    outline-offset: 2px;
  }
`
