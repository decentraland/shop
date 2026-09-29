import styled from '@emotion/styled'
import { theme } from '~/styles/theme'

// The issue modal's card, header and buttons, so choosing the owners and issuing to them read as one flow.
export {
  Actions,
  Card,
  Close,
  Head,
  Note,
  OutlineBtn,
  PrimaryBtn,
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
  color: ${theme.colors.text};
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
  border: 1px solid rgba(22, 21, 24, 0.16);
  background: ${theme.colors.white};
  color: ${theme.colors.text};
  font-family: ${theme.font.sans};
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;

  &[aria-pressed='true'] {
    border-color: ${theme.colors.accent};
    background: ${theme.colors.accent};
    color: ${theme.colors.white};
  }
  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  &:focus-visible {
    outline: 2px solid ${theme.colors.accent};
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
  border: 1px solid rgba(22, 21, 24, 0.12);
  border-radius: 10px;
  background: ${theme.colors.white};
  text-align: left;
  cursor: pointer;
  font-family: ${theme.font.sans};
  color: ${theme.colors.text};

  &[aria-pressed='true'] {
    border-color: ${theme.colors.accent};
    box-shadow: inset 0 0 0 1px ${theme.colors.accent};
  }
  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  &:focus-visible {
    outline: 2px solid ${theme.colors.accent};
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
    color: ${theme.colors.muted};
  }
`

export const Recipients = styled.ol`
  margin: 0;
  padding: 0 0 0 20px;
  max-height: 160px;
  overflow-y: auto;
  font-family: ${theme.font.sans};
  font-size: 13px;
  color: ${theme.colors.text};

  li {
    padding: 3px 0;
  }
  li span {
    color: ${theme.colors.muted};
  }
  /* The dashboard drives the MANA mark white for its dark panels, and this modal opens inside it on white. */
  [data-kind='mana'] img {
    filter: none;
  }
`
