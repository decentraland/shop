import styled from '@emotion/styled'
import { theme } from '~/styles/theme'

const { colors, radius, media } = theme

export const Root = styled.div`
  position: relative;
  display: inline-flex;
  align-items: center;
`

// Sits in the global navbar row next to the credits / MANA chips, so it borrows their shape and the
// dark-on-violet treatment TopNav.styles.ts gives them (ui2 styles those near-white for its own dark
// bar; the shop's bar is light violet, see NavbarViolet).
export const Trigger = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 8px 0 10px;
  background: transparent;
  border: 0;
  border-radius: ${radius.pill};
  color: ${colors.text2};
  font-family: ${theme.font.sans};
  font-weight: 600;
  font-size: 13px;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  transition: background-color 0.15s ease;

  &:hover {
    background-color: ${colors.navOverlayHover};
  }
  &[aria-expanded='true'] {
    background-color: ${colors.navOverlayActive};
  }
  &:focus-visible {
    outline: 2px solid ${colors.accent};
    outline-offset: 1px;
  }
  &[data-pending] {
    cursor: progress;
  }

  /* Below the navbar's own breakpoint the row is tight, so the chip keeps only its dot + chevron. The
     name stays in the menu and in the button's aria-label, so nothing is lost to a screen reader. */
  ${media.maxWidth('mobile')} {
    gap: 4px;
    padding: 0 4px 0 6px;
  }
`

// A network's identity mark. Deliberately a plain coloured dot rather than a chain logo: the shop would
// otherwise need bitmap assets for each chain in the navbar's critical path, and the dot is what makes
// "which one am I on?" answerable at a glance from across the row.
export const Dot = styled.span<{ tint: string }>`
  flex: 0 0 auto;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${({ tint }) => tint};
`

export const Name = styled.span`
  ${media.maxWidth('mobile')} {
    display: none;
  }
`

export const Menu = styled.ul`
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 41;
  min-width: 200px;
  margin: 0;
  padding: 4px;
  list-style: none;
  background: ${colors.white};
  border: 1px solid ${colors.line};
  border-radius: ${radius.btn};
  box-shadow: 0 4px 25px 5px rgba(0, 0, 0, 0.25);
`

export const Heading = styled.li`
  padding: 6px 8px;
  color: ${colors.muted1};
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
`

export const Option = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: 38px;
  padding: 0 8px;
  background: ${colors.white};
  border: 0;
  border-radius: ${radius.chip};
  color: ${colors.gray0};
  font-family: ${theme.font.sans};
  font-size: 14px;
  line-height: 1.43;
  text-align: left;
  white-space: nowrap;
  cursor: pointer;

  &:hover {
    background: ${colors.panel};
  }
  &:focus-visible {
    outline: 2px solid ${colors.accent};
    outline-offset: -2px;
  }
  &[aria-selected='true'] {
    background: ${colors.media};
    font-weight: 600;
    color: ${colors.text2};
  }
`

// "Connected" / "Confirm in your wallet" — the state of the row, pushed to its trailing edge.
export const State = styled.span`
  margin-left: auto;
  padding-left: 8px;
  color: ${colors.muted};
  font-size: 12px;
  font-weight: 400;
`
