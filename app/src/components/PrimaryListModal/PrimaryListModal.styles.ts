import styled from '@emotion/styled'
import { theme } from '~/styles/theme'

// Primary (creator mint) publish modal — same visual language as SellModal.styles.ts (white rounded
// card, header + close, asset card, framed price field with credits glyph + USD hint, purple full-width
// CTA, green success screen). Kept self-contained (mirrors the shared pieces) rather than importing from
// SellModal so the two modals stay decoupled; the primary-specific bits (readiness Note, availability
// SuccessDetail) live only here.

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

// The available-quantity line ("From your collection … · N available") — primary-specific.
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
  color: ${theme.colors.text};
`

export const AssetBy = styled.p`
  margin: 0;
  font-family: ${theme.font.sans};
  font-size: 10px;
  line-height: 1.43;
  color: ${theme.colors.muted};
`

// Single full-width Price field.
export const Field = styled.label`
  display: flex;
  flex-direction: column;
  gap: 4px;
`

export const FieldLabel = styled.span`
  font-family: ${theme.font.sans};
  font-size: 12px;
  color: ${theme.colors.muted};
`

// The framed input row (price glyph + number + USD hint).
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

// Muted helper notes below the field — the whole-credits pricing note and the readiness note.
export const Note = styled.p`
  margin: 0;
  font-family: ${theme.font.sans};
  font-size: 12px;
  line-height: 1.5;
  color: ${theme.colors.muted};
`

// Full-width primary action (Put on sale) — solid purple, matching SellModal's PrimaryBtn.
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

// ---- Success state (mirrors SellModal's green banner) --------------------------------------------

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

// The primary-specific "Listed for <glyph> N · M available" detail under the success headline.
export const SuccessDetail = styled.p`
  margin: 0;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-family: ${theme.font.sans};
  font-size: 14px;
  line-height: 1.43;
  color: ${theme.colors.text2};

  strong {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-weight: 700;
  }
  .ccy-mark {
    width: 18px;
    height: 18px;
    color: ${theme.colors.rarity};
  }
`

export const Actions = styled.div`
  display: flex;
  gap: 12px;

  ${theme.media.maxWidth('mobile')} {
    flex-direction: column-reverse;
  }
`

// Purple-outline secondary (Done).
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

// Solid purple primary (View in Shop).
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
