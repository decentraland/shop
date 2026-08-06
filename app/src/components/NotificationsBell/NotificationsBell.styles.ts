import styled from '@emotion/styled'
import { keyframes } from '@emotion/react'
import { theme } from '~/styles/theme'

const { colors, radius, media, font } = theme

const slideDown = keyframes`
  from {
    opacity: 0;
    transform: translateY(-8px);
  }
  to {
    opacity: 1;
    transform: none;
  }
`

// Anchors the panel and, more importantly, keeps the bell a BLOCK-level box. The navbar's right-hand
// group is a flex row with align-items: center, so whatever box it centres is what decides where the
// glyph lands. An inline wrapper hands that job to baseline arithmetic instead, and the bell then sits
// a few px below the balances and the avatar — by an amount that changes with the font metrics at each
// zoom level. See the alignment block in e2e/notifications.e2e.ts.
export const Wrap = styled.div`
  position: relative;
  display: flex;
  align-items: center;
`

// 24px square, same as the glyph, so the box the row centres and the ink share a centre line.
export const Bell = styled.button`
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  flex: 0 0 auto;
  padding: 0;
  border: 0;
  background: none;
  color: ${colors.text2};
  border-radius: ${radius.chip};
  cursor: pointer;
  transition: opacity 0.12s ease;

  /* Widens the tap target to ~44px without giving the button a bigger layout box, which would pull the
     glyph off the row's centre line and eat into the 24px gaps either side. */
  &::after {
    content: '';
    position: absolute;
    inset: -10px;
  }

  &:hover {
    opacity: 0.7;
  }
  &:focus-visible {
    outline: 2px solid ${colors.accent};
    outline-offset: 4px;
  }
`

// Absolutely positioned so an unread count OVERLAPS the bell's top-right corner instead of displacing
// it: the badge must never take part in the row's layout.
export const Badge = styled.span`
  position: absolute;
  top: -4px;
  right: -4px;
  box-sizing: border-box;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: ${radius.pill};
  background: ${colors.dclRed};
  color: ${colors.white};
  font-family: ${font.sans};
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
  pointer-events: none;
`

export const Panel = styled.div`
  position: absolute;
  top: 100%;
  right: -12px;
  margin-top: 16px;
  width: 390px;
  max-height: 70vh;
  /* Clears decentraland-ui2's own navbar stack (navbar 1100, mobile menu 1101). */
  z-index: 1102;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: ${colors.white};
  border: 1px solid ${colors.line};
  border-radius: ${radius.card};
  box-shadow: 0 8px 32px rgba(22, 21, 24, 0.18);
  font-family: ${font.sans};
  animation: ${slideDown} 0.15s ease;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }

  /* Full-bleed sheet flush under the navbar (64px tall at this width) rather than a 390px card that
     would hang off the right edge. margin-top has to go with it, or the sheet floats 16px low and
     shows a strip of the page between itself and the bar. */
  ${media.maxWidth('mobile')} {
    position: fixed;
    top: var(--nav-h);
    left: 0;
    right: 0;
    width: auto;
    margin-top: 0;
    max-height: calc(100vh - var(--nav-h));
    border-radius: 0;
    border-left: 0;
    border-right: 0;
  }
`

export const Header = styled.div`
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid ${colors.line};
`

export const Title = styled.span`
  font-size: 18px;
  font-weight: 600;
  color: ${colors.text};
`

export const List = styled.div`
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  overscroll-behavior: contain;
`

// One row per notification, newest first. The inner content (icon, title, body with its links, relative
// timestamp and the unread dot) is decentraland-ui2's per-type renderer, shared with the marketplace.
export const Item = styled.div`
  border-bottom: 1px solid ${colors.line};
  transition: background 0.12s ease;

  &:last-of-type {
    border-bottom: 0;
  }
  &[data-unread='true'] {
    background: ${colors.promptLilac};
  }
  &:hover {
    background: ${colors.media};
  }
`

export const Empty = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 24px;
  color: ${colors.muted};
  font-size: 15px;
  text-align: center;
`
