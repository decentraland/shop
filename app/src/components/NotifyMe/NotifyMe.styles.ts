import styled from '@emotion/styled'
import { css } from '@emotion/react'
import { theme } from '~/styles/theme'

const { colors, radius } = theme

// "Notify me when available" control on the item detail. Three shapes share one root: the email form
// (signed in), a sign-in prompt (guest), and the subscribed confirmation pill (data-done).
const rootCss = css`
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
`

export const Form = styled.form`
  ${rootCss};
`

// data-done = the subscribed confirmation: a soft-green pill laid out as one row.
export const Root = styled.div`
  ${rootCss};

  &[data-done] {
    flex-direction: row;
    align-items: center;
    gap: 16px;
    padding: 12px;
    border-radius: 16px;
    background: rgba(193, 238, 207, 0.5);
  }
`

export const Label = styled.label`
  font-size: 14px;
  color: ${colors.text};
`

// Email field + the NOTIFY ME button share one 42px row.
export const Row = styled.div`
  display: flex;
  align-items: stretch;
  gap: 8px;
`

export const Input = styled.input`
  flex: 1;
  min-width: 0;
  height: 42px;
  padding: 0 16px;
  border: 1px solid ${colors.muted};
  border-radius: ${radius.btn};
  background: ${colors.white};
  font-size: 16px;
  color: ${colors.text};

  &::placeholder {
    color: ${colors.muted2};
  }
  &:focus-visible {
    outline: none;
    border-color: ${colors.accent};
    box-shadow: 0 0 0 1px ${colors.accent};
  }
`

// The purple CTA, shared by the submit button and the guest sign-in prompt (data-full).
export const PurpleBtn = styled.button`
  flex-shrink: 0;
  height: 42px;
  padding: 0 16px;
  border: 0;
  border-radius: ${radius.btn};
  background: ${colors.accent};
  color: ${colors.softWhite};
  font-weight: 600;
  font-size: 15px;
  text-transform: uppercase;
  letter-spacing: 0.46px;
  cursor: pointer;
  transition: opacity 0.15s ease;

  &[data-full] {
    width: 100%;
    flex-shrink: 1;
  }
  &:hover:not(:disabled) {
    opacity: 0.9;
  }
  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
`

// The bright Figma green for this pill, not theme's darker `okStrong` badge green — kept literal so the
// migration doesn't change pixels. (Success's banner uses its own near-identical #34ce77; worth
// reconciling into one token as a design decision, not as part of this refactor.)
export const DoneCheck = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #34ce76;
  color: ${colors.white};
`

export const DoneText = styled.span`
  font-size: 16px;
  line-height: 1.5;
  color: ${colors.text2};
`
