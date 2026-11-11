import styled from '@emotion/styled'
import { theme } from '~/styles/theme'
import { dark } from '~/styles/darkSurface'

// The issue modal's card, header and buttons, so choosing the owners and issuing to them read as one flow.
export {
  ActionBtn,
  Actions,
  Card,
  Close,
  Head,
  Note,
  Scrim,
  Subtitle,
  Title
} from '~/components/IssueModal/IssueModal.styles'

export const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`

export const Label = styled.span`
  font-family: ${theme.font.sans};
  font-size: 13px;
  font-weight: 600;
  color: ${theme.colors.softWhite};
`

export const Chips = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`

export const Chip = styled.button`
  min-height: 40px;
  padding: 0 14px;
  border-radius: ${theme.radius.pill};
  border: 0;
  background: ${theme.colors.glass};
  color: ${theme.colors.softWhite};
  font-family: ${theme.font.sans};
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;

  &:hover:not(:disabled):not([aria-pressed='true']) {
    background: ${theme.colors.glassHover};
  }
  &[aria-pressed='true'] {
    background: ${theme.colors.softWhite};
    color: ${theme.colors.text};
  }
  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  &:focus-visible {
    outline: 2px solid ${theme.colors.softWhite};
    outline-offset: 2px;
  }
`

export const Items = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 208px;
  overflow-y: auto;
`

export const ItemOption = styled.button`
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 48px;
  padding: 6px 10px;
  border: 1px solid ${dark.hairline};
  border-radius: 10px;
  background: ${dark.raised};
  text-align: left;
  cursor: pointer;
  font-family: ${theme.font.sans};
  color: ${theme.colors.softWhite};

  &:hover:not(:disabled):not([aria-pressed='true']) {
    background: ${theme.colors.glassFaint};
  }
  &[aria-pressed='true'] {
    border-color: ${theme.colors.softWhite};
    background: ${theme.colors.glassStrong};
    box-shadow: inset 0 0 0 1px ${theme.colors.softWhite};
  }
  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  &:focus-visible {
    outline: 2px solid ${theme.colors.softWhite};
    outline-offset: 2px;
  }

  img {
    width: 36px;
    height: 36px;
    border-radius: 6px;
    object-fit: cover;
    flex: none;
  }
`

export const ItemText = styled.span`
  display: flex;
  flex-direction: column;
  min-width: 0;

  b {
    font-size: 13px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  span {
    font-size: 12px;
    color: ${theme.colors.glassText};
  }
`

export const Recipients = styled.ol`
  margin: 0;
  padding: 0 0 0 20px;
  max-height: 160px;
  overflow-y: auto;
  font-family: ${theme.font.sans};
  font-size: 13px;
  color: ${theme.colors.softWhite};

  li {
    padding: 3px 0;
  }
  li span {
    color: ${theme.colors.glassText};
  }
  /* The MANA mark is drawn dark; knocked out to white so it reads on the card. */
  [data-kind='mana'] img {
    filter: brightness(0) invert(1);
  }
`
