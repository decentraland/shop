import styled from '@emotion/styled'
import { css } from '@emotion/react'
import { theme } from '~/styles/theme'
import { Button } from '~/components/Button'
import { CurrencyIcon } from '~/components/CurrencyIcon'
import { ErrorNotice } from '~/components/ErrorNotice'

const { colors, radius } = theme

// Buy Now checkout modal for legacy (market) items — bought directly, never added to the cart.
export const Modal = styled.div`
  position: fixed;
  inset: 0;
  z-index: 60;
  display: grid;
  place-items: center;
  padding: 20px;
`

export const Scrim = styled.div`
  position: absolute;
  inset: 0;
  background: rgba(22, 21, 24, 0.45);
`

// cart-pop-in is a global keyframe (index.css).
export const Card = styled.div`
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 420px;
  background: #fff;
  border-radius: ${radius.banner};
  padding: 24px;
  box-shadow: 0 24px 60px rgba(22, 21, 24, 0.28);
  animation: cart-pop-in 0.16s ease;
`

export const Head = styled.div`
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 18px;
`

export const Thumb = styled.div`
  width: 64px;
  height: 64px;
  flex: none;
  border-radius: 12px;
  overflow: hidden;
  background: ${colors.media};

  & img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
`

export const Name = styled.div`
  font-weight: 700;
  font-size: 16px;
  color: ${colors.text};
  margin-bottom: 6px;
`

export const Price = styled.div`
  background: ${colors.panel};
  border-radius: 14px;
  padding: 16px;
  margin-bottom: 14px;
`

export const PriceLabel = styled.div`
  color: ${colors.muted};
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 6px;
`

// data-approx = the pre-lock indicative "≈" price (softer colour).
export const PriceValue = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 700;
  font-size: 24px;
  color: ${colors.text};

  &[data-approx] {
    color: ${colors.text2};
  }
`

export const Approx = styled.span`
  color: ${colors.muted};
`

export const Diamond = styled(CurrencyIcon)`
  width: 20px;
  height: 20px;
  color: ${colors.accent};
`

// Composes the global `.muted` for colour; adds spacing.
export const PriceSub = styled.div`
  margin-top: 6px;
  font-size: 13px;
`

export const Balance = styled.div`
  font-size: 13px;
  margin-bottom: 6px;
`

const noteCss = css`
  margin: 6px 0 0;
  font-size: 13px;
`
export const Note = styled.p`
  ${noteCss};
`
export const NoteNotice = styled(ErrorNotice)`
  ${noteCss};
`

export const Actions = styled.div`
  display: flex;
  gap: 10px;
  margin-top: 18px;
`

// The two footer buttons split the row evenly.
export const ActionBtn = styled(Button)`
  flex: 1;
`
