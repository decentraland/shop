import styled from '@emotion/styled'
import { Button } from '~/components/Button'
import { dark, darkCard, darkField } from '~/styles/darkSurface'
import { theme } from '~/styles/theme'

// "Issue copies" modal — same visual language as PrimaryListModal.styles / SellModal.styles (dark card,
// header + close, framed inputs, primary CTA, success screen). The
// issue-specific bits are the repeatable recipient ROWS (address + amount + remove) and the running
// "{sum} / {available}" total line. Kept self-contained (mirrors the shared pieces) rather than
// importing from the other modals so they stay decoupled.

export const Scrim = styled.div`
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(22, 21, 24, 0.55);
`

export const Card = styled.div`
  width: 560px;
  max-width: 100%;
  max-height: 92vh;
  overflow-y: auto;
  ${darkCard}
  border-radius: ${theme.radius.modal};
  padding: 12px 16px 16px;
  display: flex;
  flex-direction: column;
  gap: 20px;
`

export const Head = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-bottom: 16px;
  border-bottom: 0.5px solid ${dark.rule};
`

export const Title = styled.h2`
  margin: 0;
  font-family: ${theme.font.sans};
  font-weight: 600;
  font-size: 20px;
  line-height: 1.6;
  color: ${theme.colors.softWhite};
`

export const Close = styled.button`
  flex: none;
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border: 0;
  background: none;
  cursor: pointer;
  color: ${theme.colors.softWhite};

  .ico {
    width: 18px;
    height: 18px;
  }
  &:disabled {
    opacity: 0.4;
    cursor: default;
  }
  &:focus-visible {
    outline: 2px solid ${dark.focusEdge};
    outline-offset: 2px;
  }
`

export const Subtitle = styled.p`
  margin: 0;
  font-family: ${theme.font.sans};
  font-size: 14px;
  line-height: 1.57;
  color: ${theme.colors.softWhite};
  text-align: left;
`

// Compact asset summary: small thumbnail beside the item name.
export const AssetRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`

export const Thumb = styled.div`
  flex: none;
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  border-radius: 12px;
  background: ${dark.raised};
  border: 1px solid ${dark.hairline};
  overflow: hidden;

  img {
    width: 48px;
    height: 48px;
    object-fit: contain;
    filter: drop-shadow(0 3px 4px rgba(0, 0, 0, 0.1));
  }
`

export const AssetName = styled.p`
  margin: 0;
  font-family: ${theme.font.sans};
  font-weight: 600;
  font-size: 16px;
  line-height: 1.4;
  color: ${theme.colors.softWhite};
`

// Container for the recipient rows.
export const Rows = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
`

// One recipient row: address input (grows) + amount input + remove button.
export const Row = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 8px;
`

export const AddressField = styled.label`
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
`

export const AmountField = styled.label`
  flex: none;
  width: 96px;
  display: flex;
  flex-direction: column;
  gap: 4px;
`

export const FieldLabel = styled.span`
  font-family: ${theme.font.sans};
  font-size: 12px;
  color: ${theme.colors.glassText};
`

export const Input = styled.input`
  height: 42px;
  padding: 0 10px;
  border-radius: 8px;
  ${darkField}
  font-family: ${theme.font.sans};
  font-size: 13px;
  outline: none;

  /* Strip the number spinners on the amount input. */
  &::-webkit-outer-spin-button,
  &::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
  &[type='number'] {
    -moz-appearance: textfield;
    appearance: textfield;
  }
`

// The small circular "remove row" control, vertically aligned with the input row (past the label).
export const RemoveBtn = styled.button`
  flex: none;
  margin-top: 22px;
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border: 1px solid ${dark.hairline};
  border-radius: 8px;
  background: transparent;
  color: ${theme.colors.gray4};
  cursor: pointer;

  .ico {
    width: 16px;
    height: 16px;
  }
  &:hover:not(:disabled) {
    color: ${dark.errorText};
    border-color: ${theme.colors.dclRed};
  }
  &:disabled {
    opacity: 0.35;
    cursor: default;
  }
  &:focus-visible {
    outline: 2px solid ${dark.focusEdge};
    outline-offset: 2px;
  }
`

// The "+ add recipient" text button.
export const AddRowBtn = styled.button`
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 0;
  background: none;
  padding: 0;
  cursor: pointer;
  font-family: ${theme.font.sans};
  font-weight: 600;
  font-size: 13px;
  color: ${theme.colors.nameLink};

  .ico {
    width: 16px;
    height: 16px;
  }
  &:disabled {
    opacity: 0.4;
    cursor: default;
  }
  &:focus-visible {
    outline: 2px solid ${dark.focusEdge};
    outline-offset: 2px;
  }
`

// Running total line "{sum} / {available} items to issue". Turns red when over the cap.
export const Total = styled.p<{ over?: boolean }>`
  margin: 0;
  font-family: ${theme.font.sans};
  font-size: 13px;
  line-height: 1.5;
  color: ${p => (p.over ? dark.errorText : theme.colors.softWhite)};

  strong {
    font-weight: 700;
  }
`

export const Note = styled.p`
  margin: 0;
  font-family: ${theme.font.sans};
  font-size: 12px;
  line-height: 1.5;
  color: ${theme.colors.glassText};
`

export const FieldError = styled.p`
  margin: 0;
  font-family: ${theme.font.sans};
  font-size: 11px;
  color: ${dark.errorText};
`

export const Actions = styled.div`
  display: flex;
  gap: 12px;

  ${theme.media.maxWidth('mobile')} {
    flex-direction: column-reverse;
  }
`

export const ActionBtn = styled(Button)`
  flex: 1 1 0;
  height: 48px;
  border-radius: 12px;
`

export const SuccessBanner = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 24px 16px;
  border-radius: 16px;
  background: ${dark.raised};
  border: 1px solid ${dark.hairline};
  text-align: center;
`

export const SuccessCheck = styled.div`
  display: grid;
  place-items: center;
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: ${theme.colors.ok};
  color: ${theme.colors.white};

  .ico {
    width: 34px;
    height: 34px;
  }
`

export const SuccessText = styled.p`
  margin: 0;
  font-family: ${theme.font.sans};
  font-size: 20px;
  line-height: 1.334;
  color: ${theme.colors.softWhite};

  b {
    font-weight: 700;
  }
`
