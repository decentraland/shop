import styled from '@emotion/styled'
import { theme } from '~/styles/theme'

// Creator sale modal: the same shell as PrimaryListModal (white rounded card, header + close, muted field
// labels, purple full-width CTA, green success banner) with chip pickers for the discount, the window and the
// start. Kept self-contained like the other modals so they stay decoupled.

export const Scrim = styled.div`
  position: fixed;
  inset: 0;
  z-index: ${theme.z.overlay};
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
  background: ${theme.colors.white};
  border-radius: ${theme.radius.modal};
  padding: 12px 16px 16px;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.3);
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
  border-bottom: 1px solid ${theme.colors.gray4};
`

export const Title = styled.h2`
  margin: 0;
  font-family: ${theme.font.sans};
  font-weight: 600;
  font-size: 20px;
  line-height: 1.6;
  color: ${theme.colors.text};
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
  color: ${theme.colors.text};

  .ico {
    width: 18px;
    height: 18px;
  }
  &:disabled {
    opacity: 0.4;
    cursor: default;
  }
  &:focus-visible {
    outline: 2px solid ${theme.colors.accent};
    outline-offset: 2px;
  }
`

export const Subtitle = styled.p`
  margin: 0;
  font-family: ${theme.font.sans};
  font-size: 14px;
  line-height: 1.57;
  color: ${theme.colors.text2};
`

export const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`

export const FieldLabel = styled.span`
  font-family: ${theme.font.sans};
  font-size: 12px;
  color: ${theme.colors.muted};
`

export const Note = styled.p`
  margin: 0;
  font-family: ${theme.font.sans};
  font-size: 12px;
  line-height: 1.5;
  color: ${theme.colors.muted};
`

export const CollectionList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 220px;
  overflow-y: auto;
`

export const CollectionRow = styled.label`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid ${theme.colors.line};
  border-radius: ${theme.radius.card};
  cursor: pointer;

  input {
    flex: none;
    width: 18px;
    height: 18px;
    accent-color: ${theme.colors.accent};
    cursor: pointer;
  }
  &[data-selected] {
    border-color: ${theme.colors.accent};
    background: ${theme.colors.promptLilac};
  }
`

export const RowInfo = styled.span`
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
`

export const RowName = styled.span`
  font-family: ${theme.font.sans};
  font-weight: 600;
  font-size: 14px;
  color: ${theme.colors.text};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

export const RowMeta = styled.span`
  font-family: ${theme.font.sans};
  font-size: 12px;
  color: ${theme.colors.muted};
`

export const Chips = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
`

// Preset pickers. Comfortable to tap (≥ 40px tall) so the same control works on mobile.
export const Chip = styled.button`
  height: 40px;
  padding: 0 14px;
  border: 1px solid ${theme.colors.gray4};
  border-radius: ${theme.radius.pill};
  background: ${theme.colors.white};
  color: ${theme.colors.text};
  font-family: ${theme.font.sans};
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;

  &[data-selected] {
    background: ${theme.colors.accent};
    border-color: ${theme.colors.accent};
    color: ${theme.colors.white};
  }
  &:hover:not(:disabled):not([data-selected]) {
    border-color: ${theme.colors.lineStrong};
  }
  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
  &:focus-visible {
    outline: 2px solid ${theme.colors.accent};
    outline-offset: 2px;
  }
`

// A short framed number input with a unit suffix (the custom percentage, the unit limit).
export const InlineInput = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 40px;
  padding: 0 10px;
  border: 0.5px solid ${theme.colors.text};
  border-radius: ${theme.radius.btn};
  background: ${theme.colors.white};
  font-family: ${theme.font.sans};
  font-size: 13px;
  color: ${theme.colors.muted};

  &:focus-within {
    border-color: ${theme.colors.magenta};
  }
  &[aria-invalid='true'] {
    border-color: ${theme.colors.err};
  }

  input {
    width: 64px;
    border: 0;
    outline: none;
    background: transparent;
    font-family: ${theme.font.sans};
    font-size: 13px;
    color: ${theme.colors.text};

    &::-webkit-outer-spin-button,
    &::-webkit-inner-spin-button {
      -webkit-appearance: none;
      margin: 0;
    }
    &[type='number'] {
      -moz-appearance: textfield;
      appearance: textfield;
    }
  }
`

export const DateInput = styled.input`
  height: 42px;
  padding: 0 10px;
  border: 0.5px solid ${theme.colors.text};
  border-radius: ${theme.radius.btn};
  background: ${theme.colors.white};
  font-family: ${theme.font.sans};
  font-size: 13px;
  color: ${theme.colors.text};
  max-width: 100%;

  &:focus {
    outline: none;
    border-color: ${theme.colors.magenta};
  }
`

export const CapRow = styled.label`
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: ${theme.font.sans};
  font-size: 13px;
  color: ${theme.colors.text};
  cursor: pointer;

  input {
    width: 18px;
    height: 18px;
    accent-color: ${theme.colors.accent};
    cursor: pointer;
  }
`

// The worked example: what one listed item costs during the sale.
export const Preview = styled.p`
  margin: 0;
  padding: 10px 12px;
  border-radius: ${theme.radius.btn};
  background: ${theme.colors.panel};
  font-family: ${theme.font.sans};
  font-size: 13px;
  line-height: 1.5;
  color: ${theme.colors.text2};
`

export const Status = styled.p`
  margin: 0;
  font-family: ${theme.font.sans};
  font-size: 13px;
  color: ${theme.colors.muted};
  text-align: center;
`

export const PrimaryBtn = styled.button`
  width: 100%;
  height: 48px;
  border: 0;
  border-radius: ${theme.radius.modal};
  cursor: pointer;
  background: ${theme.colors.accent};
  color: ${theme.colors.white};
  font-family: ${theme.font.sans};
  font-weight: 600;
  font-size: 15px;
  line-height: 24px;
  letter-spacing: 0.46px;
  text-transform: uppercase;

  &:hover:not(:disabled) {
    background: ${theme.colors.accentHover};
  }
  &:focus-visible {
    outline: 2px solid ${theme.colors.accent};
    outline-offset: 2px;
  }
  &:disabled {
    cursor: not-allowed;
    background: rgba(105, 31, 169, 0.2);
    color: ${theme.colors.white};
  }
`

export const Actions = styled.div`
  display: flex;
  gap: 12px;

  ${theme.media.maxWidth('mobile')} {
    flex-direction: column;
  }
`

const actionBtn = `
  flex: 1 1 0;
  height: 48px;
  border-radius: ${theme.radius.modal};
  cursor: pointer;
  font-family: ${theme.font.sans};
  font-weight: 600;
  font-size: 15px;
  letter-spacing: 0.46px;
  text-transform: uppercase;
  &:focus-visible {
    outline: 2px solid ${theme.colors.accent};
    outline-offset: 2px;
  }
`

export const OutlineBtn = styled.button`
  ${actionBtn}
  border: 1px solid ${theme.colors.accent};
  background: ${theme.colors.white};
  color: ${theme.colors.accent};
`

export const PurpleBtn = styled.button`
  ${actionBtn}
  border: 0;
  background: ${theme.colors.accent};
  color: ${theme.colors.white};

  &:hover {
    background: ${theme.colors.accentHover};
  }
`

export const SuccessBanner = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 24px 16px;
  border-radius: ${theme.radius.modal};
  background: rgba(193, 238, 207, 0.5);
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
  line-height: 1.4;
  color: ${theme.colors.text};
`

export const SuccessDetail = styled.p`
  margin: 0;
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: center;
  gap: 6px;
  font-family: ${theme.font.sans};
  font-size: 14px;
  color: ${theme.colors.text2};
`
