import styled from '@emotion/styled'
import { Button } from '~/components/Button'
import { calendarPopup } from '~/styles/datePicker'
import { dark, darkCard, darkField } from '~/styles/darkSurface'
import { theme } from '~/styles/theme'

// Sell / list modal (Figma 1528-305117) and its listing-success state (Figma 1528-306276). 560px card
// matching the shop's other modals; native date input for the expiration so no picker dependency is added.

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
  gap: 24px;
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

// Asset summary card: a large square thumbnail beside the item name.
export const AssetCard = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`

export const Thumb = styled.div`
  flex: none;
  display: grid;
  place-items: center;
  width: 180px;
  height: 180px;
  border-radius: 16px;
  background: ${dark.raised};
  border: 1px solid ${dark.hairline};
  overflow: hidden;

  img {
    width: 150px;
    height: 150px;
    object-fit: contain;
    filter: drop-shadow(0 3px 4px rgba(0, 0, 0, 0.1));
  }

  ${theme.media.maxWidth('mobile')} {
    width: 120px;
    height: 120px;

    img {
      width: 100px;
      height: 100px;
    }
  }
`

export const AssetInfo = styled.div`
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
`

export const AssetName = styled.p`
  margin: 0;
  font-family: ${theme.font.sans};
  font-weight: 600;
  font-size: 20px;
  line-height: 1.57;
  color: ${theme.colors.softWhite};
`

export const AssetBy = styled.p`
  margin: 0;
  font-family: ${theme.font.sans};
  font-size: 10px;
  line-height: 1.43;
  color: ${theme.colors.glassText};
`

// Price + Expiration fields, side by side.
export const Fields = styled.div`
  display: flex;
  gap: 12px;

  ${theme.media.maxWidth('mobile')} {
    flex-direction: column;
  }
`

export const Field = styled.label`
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
`

export const FieldLabel = styled.span`
  font-family: ${theme.font.sans};
  font-size: 12px;
  color: ${theme.colors.glassText};
`

// The framed input row (price glyph + number + USD hint, or the date input).
export const InputBox = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  height: 42px;
  padding: 0 8px;
  border-radius: 8px;
  ${darkField}

  .ccy {
    flex: none;
    width: 22px;
    height: 22px;
  }
  .cal {
    flex: none;
    width: 18px;
    height: 18px;
    color: ${theme.colors.softWhite};
  }
`

export const PriceInput = styled.input`
  flex: 1 1 auto;
  min-width: 0;
  border: 0;
  outline: none;
  background: transparent;
  font-family: ${theme.font.sans};
  font-size: 13px;
  color: ${theme.colors.softWhite};

  &::placeholder {
    color: ${theme.colors.gray4};
  }
  /* Strip the number spinners — the glyph + USD hint carry the affordance. */
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

export const UsdHint = styled.span`
  flex: none;
  font-family: ${theme.font.sans};
  font-size: 10px;
  color: ${theme.colors.glassText};
`

// Wrapper around react-datepicker. Styles BOTH the input (to match the price InputBox: border, radius,
// height) AND the calendar popup — the library's default CSS is imported in SellModal, this overrides it. (A native <input type="date"> can't be themed like this — hence the lib.)
export const DateField = styled.div`
  .react-datepicker-wrapper {
    display: block;
    width: 100%;
  }
  .react-datepicker__input-container {
    display: flex;
    align-items: center;
  }
  .react-datepicker__input-container input {
    width: 100%;
    height: 42px;
    padding: 0 8px;
    border-radius: 8px;
    ${darkField}
    font-family: ${theme.font.sans};
    font-size: 13px;
    outline: none;
  }
  &[data-invalid='true'] .react-datepicker__input-container input {
    border-color: ${theme.colors.dclRed};
  }
  /* The showIcon calendar glyph inside the field. */
  .react-datepicker__calendar-icon {
    fill: ${theme.colors.softWhite};
    opacity: 0.85;
  }

  ${calendarPopup}
`

export const PrimaryBtn = styled(Button)`
  width: 100%;
  height: 48px;
  border-radius: 16px;
`

// Small informational line under the price field (e.g. the credits-proceeds hint shown when
// PROCEEDS_TO_TREASURY is on). Mirrors PrimaryListModal's Note.
export const Note = styled.p`
  margin: 0;
  font-family: ${theme.font.sans};
  font-size: 12px;
  line-height: 1.5;
  color: ${theme.colors.glassText};
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
