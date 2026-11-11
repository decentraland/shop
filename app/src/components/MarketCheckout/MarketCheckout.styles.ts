import styled from '@emotion/styled'
import { css } from '@emotion/react'
import { dark, darkCard } from '~/styles/darkSurface'
import { theme } from '~/styles/theme'
import { Button } from '~/components/Button'
import { CurrencyIcon } from '~/components/CurrencyIcon'
import { ErrorNotice } from '~/components/ErrorNotice'

export { Chip } from '~/styles/chip.styles'

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
  ${darkCard}
  border-radius: ${radius.modal};
  padding: 24px;
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
  background: ${dark.raised};

  & img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
`

export const Name = styled.div`
  font-weight: 700;
  font-size: 16px;
  color: ${colors.softWhite};
  margin-bottom: 6px;
`

export const Price = styled.div`
  background: ${dark.raised};
  border: 1px solid ${dark.hairline};
  border-radius: 14px;
  padding: 16px;
  margin-bottom: 14px;
`

export const PriceLabel = styled.div`
  color: ${colors.glassText};
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
  color: ${colors.softWhite};

  &[data-approx] {
    color: ${colors.gray5};
  }
`

export const Approx = styled.span`
  color: ${colors.glassText};
`

export const Diamond = styled(CurrencyIcon)`
  width: 20px;
  height: 20px;
  color: ${colors.softWhite};
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
