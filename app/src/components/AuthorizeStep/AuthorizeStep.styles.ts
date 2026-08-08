import styled from '@emotion/styled'
import { keyframes } from '@emotion/react'
import { theme } from '~/styles/theme'

// The pre-action authorization STEP shown before a buy/sell for self-custody wallets. Its visual
// language mirrors the Approvals page (Authorizations.styles): a bordered row card for the thing being
// authorized, muted supporting copy, and the shop's modal shell (Scrim/Card ≈ SellModal.styles).

const spin = keyframes`
  to { transform: rotate(360deg); }
`

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
  width: 480px;
  max-width: 100%;
  max-height: 92vh;
  overflow-y: auto;
  background: ${theme.colors.white};
  border-radius: 16px;
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

// The row card describing what's being authorized — same footprint/tone as an Approvals-page Row.
// Sits beside the heading: the buyer needs the count BEFORE they read what they are granting, so it goes
// in the head rather than under the row.
export const StepCount = styled.span`
  margin-left: auto;
  margin-right: 12px;
  color: ${theme.colors.muted};
  font-size: 14px;
  white-space: nowrap;
`

export const Row = styled.div`
  display: grid;
  grid-template-columns: 44px 1fr;
  align-items: center;
  gap: 14px;
  padding: 14px 18px;
  background: ${theme.colors.white};
  border: 1px solid ${theme.colors.line};
  border-radius: 16px;
`

export const Thumb = styled.div`
  width: 44px;
  height: 44px;
  border-radius: 10px;
  background: ${theme.colors.media};
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${theme.colors.muted2};

  img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  .ccy-mark {
    width: 26px;
    height: 26px;
  }
`

export const RowInfo = styled.div`
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
`

export const RowName = styled.span`
  font-weight: 700;
  color: ${theme.colors.text};
`

export const RowDesc = styled.span`
  font-size: 13px;
  line-height: 1.45;
  color: ${theme.colors.muted};
`

// Reassuring, jargon-light footnote (no gas, revocable from Approvals).
export const Note = styled.p`
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: ${theme.colors.muted2};
`

export const Actions = styled.div`
  display: flex;
  gap: 12px;

  ${theme.media.maxWidth('mobile')} {
    flex-direction: column-reverse;
  }
`

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

  &:hover:not(:disabled) {
    background: rgba(105, 31, 169, 0.06);
  }
  &:disabled {
    cursor: default;
    opacity: 0.5;
  }
  &:focus-visible {
    outline: 2px solid ${theme.colors.accent};
    outline-offset: 2px;
  }
`

export const PurpleBtn = styled.button`
  flex: 1 1 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
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

  &:hover:not(:disabled) {
    background: ${theme.colors.accentHover};
  }
  &:disabled {
    cursor: default;
    background: rgba(105, 31, 169, 0.4);
  }
  &:focus-visible {
    outline: 2px solid ${theme.colors.accent};
    outline-offset: 2px;
  }
`

export const Spinner = styled.span`
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.5);
  border-top-color: ${theme.colors.white};
  animation: ${spin} 0.7s linear infinite;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`
