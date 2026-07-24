import styled from '@emotion/styled'
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
  background: ${theme.colors.white};
  border-radius: 16px;
  padding: 12px 16px 16px;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.3);
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
  color: ${theme.colors.text};
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
  background: ${theme.colors.media};
  border: 1px solid ${theme.colors.gray4};
  overflow: hidden;

  img {
    width: 150px;
    height: 150px;
    object-fit: contain;
    filter: drop-shadow(0 3px 4px rgba(0, 0, 0, 0.1));
  }

  ${theme.media.down('mobile')} {
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
  color: ${theme.colors.text};
`

export const AssetBy = styled.p`
  margin: 0;
  font-family: ${theme.font.sans};
  font-size: 10px;
  line-height: 1.43;
  color: ${theme.colors.muted};
`

// Price + Expiration fields, side by side.
export const Fields = styled.div`
  display: flex;
  gap: 12px;

  ${theme.media.down('mobile')} {
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
  color: ${theme.colors.muted};
`

// The framed input row (price glyph + number + USD hint, or the date input).
export const InputBox = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  height: 42px;
  padding: 0 8px;
  border: 0.5px solid ${theme.colors.text};
  border-radius: 8px;
  background: ${theme.colors.white};

  &:focus-within {
    border-color: ${theme.colors.magenta};
  }
  &[aria-invalid='true'] {
    border-color: ${theme.colors.err};
  }

  .ccy {
    flex: none;
    width: 22px;
    height: 22px;
    color: ${theme.colors.rarity};
  }
  .cal {
    flex: none;
    width: 18px;
    height: 18px;
    color: ${theme.colors.text};
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
  color: ${theme.colors.text};

  &::placeholder {
    color: ${theme.colors.muted2};
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
  color: ${theme.colors.muted2};
`

// Wrapper around react-datepicker. Styles BOTH the input (to match the price InputBox: border, radius,
// height) AND the calendar popup to a WHITE, on-brand theme — the library's default CSS is imported in
// SellModal, this overrides it. (A native <input type="date"> can't be themed like this — hence the lib.)
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
    border: 0.5px solid ${theme.colors.text};
    border-radius: 8px;
    background: ${theme.colors.white};
    font-family: ${theme.font.sans};
    font-size: 13px;
    color: ${theme.colors.text};
    outline: none;
  }
  .react-datepicker__input-container input:focus {
    border-color: ${theme.colors.magenta};
  }
  &[data-invalid='true'] .react-datepicker__input-container input {
    border-color: ${theme.colors.err};
  }
  /* The showIcon calendar glyph inside the field. */
  .react-datepicker__calendar-icon {
    fill: ${theme.colors.text};
    opacity: 0.85;
  }

  /* ---- Calendar popup: white / on-brand (override react-datepicker defaults) ---- */
  .react-datepicker-popper {
    z-index: 40;
  }
  .react-datepicker {
    font-family: ${theme.font.sans};
    font-size: 13px;
    color: ${theme.colors.text};
    background: ${theme.colors.white};
    border: 1px solid rgba(22, 21, 24, 0.1);
    border-radius: 12px;
    box-shadow: 0 12px 32px rgba(22, 21, 24, 0.14);
    overflow: hidden;
  }
  .react-datepicker__triangle {
    display: none;
  }
  .react-datepicker__header {
    background: ${theme.colors.white};
    border-bottom: 1px solid rgba(22, 21, 24, 0.1);
    padding-top: 12px;
  }
  .react-datepicker__current-month {
    color: ${theme.colors.text};
    font-weight: 600;
    font-size: 14px;
  }
  .react-datepicker__day-name {
    color: ${theme.colors.muted2};
  }
  .react-datepicker__day {
    color: ${theme.colors.text};
    border-radius: 8px;
  }
  .react-datepicker__day:hover {
    background: rgba(105, 31, 169, 0.1);
  }
  .react-datepicker__day--selected,
  .react-datepicker__day--keyboard-selected {
    background: ${theme.colors.accent};
    color: ${theme.colors.white};
  }
  .react-datepicker__day--today {
    font-weight: 700;
  }
  .react-datepicker__day--disabled {
    color: ${theme.colors.muted2};
    opacity: 0.5;
  }
  .react-datepicker__navigation-icon::before {
    border-color: ${theme.colors.accent};
  }
  .react-datepicker__today-button {
    background: ${theme.colors.white};
    border-top: 1px solid rgba(22, 21, 24, 0.1);
    color: ${theme.colors.accent};
    font-weight: 600;
    padding: 10px;
  }
`

// Full-width primary action (Put up for sale) — solid purple (Figma 1528-305251; the disabled state
// is the same purple at 20%, so the enabled fill is the solid accent, not the dark PDP button).
export const PrimaryBtn = styled.button`
  width: 100%;
  height: 48px;
  border: 0;
  border-radius: 16px;
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

export const Status = styled.p`
  margin: 0;
  font-family: ${theme.font.sans};
  font-size: 13px;
  color: ${theme.colors.muted};
  text-align: center;
`

// ---- Success state (Figma 1528-306276) ----------------------------------------------------------

export const SuccessBanner = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 24px 16px;
  border-radius: 16px;
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
  line-height: 1.334;
  color: ${theme.colors.text2};

  b {
    font-weight: 700;
  }
`

export const Actions = styled.div`
  display: flex;
  gap: 12px;

  ${theme.media.down('mobile')} {
    flex-direction: column-reverse;
  }
`

// Purple-outline secondary (My items) — Figma 1528-306276 (2px #691fa9, radius 12).
export const OutlineBtn = styled.button`
  flex: 1 1 0;
  height: 48px;
  border: 2px solid ${theme.colors.accent};
  border-radius: 12px;
  background: transparent;
  color: ${theme.colors.accent};
  cursor: pointer;
  font-family: ${theme.font.sans};
  font-weight: 600;
  font-size: 13px;
  line-height: 24px;
  letter-spacing: 0.46px;
  text-transform: uppercase;

  &:hover {
    background: rgba(105, 31, 169, 0.06);
  }
  &:focus-visible {
    outline: 2px solid ${theme.colors.accent};
    outline-offset: 2px;
  }
`

// Solid purple primary (Done) — Figma 1528-306276 (radius 12).
export const PurpleBtn = styled.button`
  flex: 1 1 0;
  height: 48px;
  border: 0;
  border-radius: 12px;
  background: ${theme.colors.accent};
  color: ${theme.colors.softWhite};
  cursor: pointer;
  font-family: ${theme.font.sans};
  font-weight: 600;
  font-size: 13px;
  line-height: 24px;
  letter-spacing: 0.46px;
  text-transform: uppercase;

  &:hover {
    background: ${theme.colors.accentHover};
  }
  &:focus-visible {
    outline: 2px solid ${theme.colors.accent};
    outline-offset: 2px;
  }
`
