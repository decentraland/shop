import styled from '@emotion/styled'
import { theme } from '~/styles/theme'

// Transfer-collectible modal. The destination-address form that backs the PDP "Transfer" action
// (Figma 1527-302810 button spec). Shell mirrors NameBuyModal (560px card, 16px radius) so the shop's
// modals stay visually consistent; the confirm/warning treatment mirrors the marketplace TransferPage.

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

  ${theme.media.maxWidth('mobile')} {
    padding: 12px 16px 16px;
  }
`

export const Head = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-bottom: 16px;
  border-bottom: 1px solid ${theme.colors.gray4};
`

export const HeadRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
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

// Item summary row (thumbnail + name), mirroring the sell modal's asset card.
export const AssetRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`

export const Thumb = styled.img`
  flex: none;
  width: 72px;
  height: 72px;
  border-radius: 12px;
  object-fit: cover;
  background: ${theme.colors.media};
`

export const AssetName = styled.p`
  margin: 0;
  font-family: ${theme.font.sans};
  font-weight: 600;
  font-size: 18px;
  line-height: 1.4;
  color: ${theme.colors.text};
`

export const Field = styled.label`
  display: flex;
  flex-direction: column;
  gap: 6px;
`

export const FieldLabel = styled.span`
  font-family: ${theme.font.sans};
  font-size: 12px;
  color: ${theme.colors.muted};
`

export const Input = styled.input`
  width: 100%;
  height: 44px;
  padding: 0 12px;
  border: 1px solid ${theme.colors.text};
  border-radius: 8px;
  background: ${theme.colors.white};
  font-family: ${theme.font.sans};
  font-size: 14px;
  color: ${theme.colors.text};

  &::placeholder {
    color: ${theme.colors.muted2};
  }
  &:focus-visible {
    outline: none;
    border-color: ${theme.colors.magenta};
  }
  &[aria-invalid='true'] {
    border-color: ${theme.colors.err};
  }
  &:disabled {
    opacity: 0.6;
  }
`

// Irreversibility warning, mirroring the marketplace transfer_page.warning copy.
export const Warning = styled.p`
  margin: 0;
  padding: 12px 14px;
  border-radius: 10px;
  background: rgba(255, 45, 85, 0.1);
  font-family: ${theme.font.sans};
  font-size: 13px;
  line-height: 1.5;
  color: ${theme.colors.text2};
`

export const Actions = styled.div`
  display: flex;
  gap: 12px;

  ${theme.media.maxWidth('mobile')} {
    flex-direction: column-reverse;
  }
`

// Dark-outline secondary (Cancel) — matches the PDP outline CTA spec (2px #242129).
export const OutlineBtn = styled.button`
  flex: 1;
  height: 48px;
  border: 2px solid ${theme.colors.blackBtn};
  border-radius: 16px;
  background: transparent;
  color: ${theme.colors.text};
  cursor: pointer;
  font-family: ${theme.font.sans};
  font-weight: 600;
  font-size: 15px;
  line-height: 24px;
  letter-spacing: 0.46px;
  text-transform: uppercase;

  &:hover:not(:disabled) {
    background: rgba(36, 33, 41, 0.06);
  }
  &:focus-visible {
    outline: 2px solid ${theme.colors.accent};
    outline-offset: 2px;
  }
  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
`

// Dark-solid primary (Transfer) — matches the PDP dark CTA spec (#242129 / #fcfcfc).
export const PrimaryBtn = styled.button`
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 48px;
  border: 0;
  border-radius: 16px;
  background: ${theme.colors.blackBtn};
  color: ${theme.colors.softWhite};
  cursor: pointer;
  font-family: ${theme.font.sans};
  font-weight: 600;
  font-size: 15px;
  line-height: 24px;
  letter-spacing: 0.46px;
  text-transform: uppercase;

  &:hover:not(:disabled) {
    filter: brightness(1.35);
  }
  &:focus-visible {
    outline: 2px solid ${theme.colors.accent};
    outline-offset: 2px;
  }
  &:disabled {
    opacity: 0.55;
    cursor: default;
  }
`

// Success state, mirroring the listing success modal (Figma 1528-306276).
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
  font-size: 16px;
  line-height: 1.34;
  color: ${theme.colors.text2};

  b {
    font-weight: 700;
  }
`
