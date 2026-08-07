import styled from '@emotion/styled'
import { theme } from '~/styles/theme'

const { colors, radius } = theme

// The shop's playback bar: a light translucent pill at the bottom of whatever preview it belongs to,
// positioned by itself so every surface gets the same bar in the same place. The descendant rules
// neutralize ui2's own dark-overlay layout (it lays its bar out absolutely against the nearest
// positioned ancestor) and restyle its buttons and scrubber to the shop's language.
export const Bar = styled.div`
  /* Doubled class: a preview panel may size its children greedily (ItemDetail's stretches every child to
     fill the stage), and the bar's own geometry has to win that whichever order the styles land in. */
  && {
    position: absolute;
    bottom: 16px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 2;
    width: min(360px, 88%);
    height: auto;
    display: flex;
    align-items: center;
    background: rgba(255, 255, 255, 0.94);
    backdrop-filter: blur(6px);
    border: 1px solid ${colors.line};
    border-radius: ${radius.pill};
    padding: 6px 12px;
    box-shadow: 0 2px 10px rgba(22, 21, 24, 0.12);
  }

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
