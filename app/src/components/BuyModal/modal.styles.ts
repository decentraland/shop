import styled from '@emotion/styled'
import { theme } from '~/styles/theme'
import { CurrencyIcon } from '~/components/CurrencyIcon'

const { colors, gradients, radius } = theme

// Shared checkout-modal shell (Figma "Buy Asset"): the scrim + card + header/balance + body states
// (asset row, warning, pack picker, total, CTAs, processing, success). Used by BOTH the single-item PDP
// BuyModal and the multi-item CartCheckoutModal; the latter adds its own `.cart-checkout*` pieces on top.

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

// cart-pop-in is a global keyframe (index.css) shared with the cart popover — referenced by name.
export const Card = styled.div`
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 560px;
  /* Grid-item auto-minimum can otherwise push the card past the viewport on a narrow screen. */
  min-width: 0;
  background: #fff;
  border-radius: 16px;
  padding: 12px 16px 16px;
  box-shadow: 0 24px 60px rgba(22, 21, 24, 0.28);
  animation: cart-pop-in 0.16s ease;
  display: flex;
  flex-direction: column;
  gap: 24px;

  &[data-tall] {
    min-height: 379px;
    justify-content: space-between;
  }
`

export const Head = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-bottom: 16px;
  border-bottom: 1px solid #cfcdd4;
`

export const HeadRow = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
`

export const Title = styled.h2`
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  line-height: 1.6;
  color: ${colors.text};
`

export const X = styled.button`
  flex-shrink: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
  padding: 2px;
  line-height: 0;
`

export const Balance = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
`

export const BalanceLabel = styled.span`
  font-size: 14px;
  font-weight: 600;
  color: #5e5b67;
`

export const BalanceIco = styled(CurrencyIcon)`
  width: 14px;
  height: 14px;
  background: ${colors.text};
`

export const BalanceValue = styled.span`
  font-size: 14px;
  color: ${colors.text};
`

export const Body = styled.div`
  display: flex;
  flex-direction: column;
  gap: 24px;

  /* Processing / loading states centre a single element in a taller body. */
  &[data-processing] {
    flex: 1;
    align-items: center;
    justify-content: center;
    gap: 32px;
    padding: 24px 0;
  }
`

export const Asset = styled.div`
  display: flex;
  gap: 12px;
  align-items: center;
`

export const AssetThumb = styled.div`
  flex-shrink: 0;
  width: 180px;
  height: 180px;
  background: ${colors.media};
  border: 1px solid ${colors.muted2};
  border-radius: 16px;
  display: grid;
  place-items: center;
  overflow: hidden;

  & img {
    width: 83%;
    height: 83%;
    object-fit: contain;
    filter: drop-shadow(0.7px 2.9px 3.7px rgba(0, 0, 0, 0.1));
  }
`

export const AssetInfo = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 32px;
  padding: 8px;
`

export const AssetName = styled.div`
  font-size: 20px;
  font-weight: 600;
  line-height: 1.57;
  color: ${colors.text};
  overflow: hidden;
  text-overflow: ellipsis;
`

export const AssetCreator = styled.div`
  font-size: 10px;
  line-height: 1.43;
  color: ${colors.muted};
`

export const AssetPrice = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;

  & span {
    font-size: 24px;
    font-weight: 600;
    color: ${colors.text2};
  }
`

export const AssetPriceIco = styled(CurrencyIcon)`
  width: 24px;
  height: 24px;
  background: ${colors.text2};
`

export const Warning = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: center;
  background: #f0dfff;
  border-radius: ${radius.btn};
  padding: 12px 8px;
`

export const WarningText = styled.p`
  margin: 0;
  font-size: 14px;
  line-height: 1.334;
  color: ${colors.text2};
  text-align: center;

  & b {
    font-weight: 700;
  }
`

export const Packs = styled.div`
  display: flex;
  gap: 12px;
`

export const Pack = styled.button`
  flex: 1;
  height: 109px;
  border: 1px solid ${colors.muted2};
  background: ${colors.media};
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  cursor: pointer;
  transition: border-color 0.12s ease;

  &[data-on] {
    border: 4px solid ${colors.magenta};
  }
`

export const PackIco = styled(CurrencyIcon)`
  width: 24px;
  height: 24px;
  background: ${colors.text};
`

export const PackAmount = styled.span`
  font-size: 24px;
  font-weight: 500;
  color: ${colors.text};
`

export const PackUsd = styled.span`
  font-size: 14px;
  color: ${colors.text};
`

export const Total = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-top: 1px solid #cfcdd4;
  padding-top: 12px;
`

export const TotalCredits = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 24px;
  font-weight: 700;
  color: ${colors.text};
`

export const TotalIco = styled(CurrencyIcon)`
  width: 30px;
  height: 30px;
  background: ${colors.text};
`

export const TotalUsd = styled.span`
  font-size: 14px;
  font-weight: 600;
  color: #5e5b67;
`

export const Ctas = styled.div`
  display: flex;
  gap: 12px;
`

export const Btn = styled.button`
  flex: 1;
  /* Let the CTAs shrink so their min-content can't widen the modal past the viewport on mobile. */
  min-width: 0;
  height: 46px;
  border-radius: ${radius.btn};
  border: 0;
  cursor: pointer;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.46px;
  text-transform: uppercase;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;

  &[data-full] {
    width: 100%;
  }
  &[data-variant='gradient'] {
    background: ${gradients.amethyst};
    color: ${colors.softWhite};
  }
  &[data-variant='outline'] {
    background: transparent;
    border: 2px solid ${colors.accent};
    color: ${colors.accent};
    font-size: 13px;
  }
  &[data-variant='ruby'] {
    background: ${colors.dclRed};
    color: ${colors.softWhite};
    font-size: 13px;
    letter-spacing: 0.61px;
  }
  &:disabled {
    opacity: 0.6;
    cursor: default;
  }
`

export const Logo = styled.img`
  width: 61px;
  height: 61px;
`

export const ProcessingText = styled.div`
  font-size: 20px;
  font-weight: 700;
  color: ${colors.text2};
  text-align: center;
`

export const Progress = styled.div`
  width: 100%;
  max-width: 456px;
  height: 12px;
  background: ${colors.media};
  border-radius: 100px;
  overflow: hidden;
`

export const ProgressFill = styled.span`
  display: block;
  height: 100%;
  width: 40%;
  border-radius: 100px;
  background: ${gradients.amethyst};
  animation: buy-modal-progress 1.1s ease-in-out infinite;

  @keyframes buy-modal-progress {
    0% {
      transform: translateX(-120%);
    }
    100% {
      transform: translateX(320%);
    }
  }
`

// `data-wide` = the cart's multi-item success banner (check to the LEFT of the text on desktop,
// stacked on mobile); the single-item BuyModal uses the default centred column.
export const Success = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  background: rgba(193, 238, 207, 0.5);
  border-radius: 16px;
  padding: 24px 16px;

  &[data-wide] {
    flex-direction: row;
    align-items: center;
    gap: 24px;
    padding: 16px 24px;
  }
  @media (max-width: 600px) {
    &[data-wide] {
      flex-direction: column;
      gap: 12px;
      padding: 16px;
    }
  }
`

export const SuccessText = styled.p`
  margin: 0;
  font-size: 20px;
  line-height: 1.334;
  color: ${colors.text2};
  text-align: center;

  & b {
    font-weight: 700;
  }

  &[data-wide] {
    text-align: left;
    font-size: 18px;
  }
  @media (max-width: 600px) {
    &[data-wide] {
      text-align: center;
    }
  }
`
