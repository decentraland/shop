import styled from '@emotion/styled'
import { theme } from '~/styles/theme'
import { CurrencyIcon } from '~/components/CurrencyIcon'
import { CreatorName } from '~/components/CreatorName'

const { colors, gradients, radius, z } = theme

// Shared checkout-modal shell (Figma "Buy Asset"): the scrim + card + header/balance + body states
// (asset row, warning, pack picker, total, CTAs, processing, success). Used by BOTH the single-item PDP
// BuyModal and the multi-item CartCheckoutModal; the latter adds its own `.cart-checkout*` pieces on top.

// Above the global DCL navbar (position: fixed, high z-index) so the scrim dims the FULL viewport,
// navbar included. Matches the cart drawer / popover "above everything" tier.
// Flex + `margin: auto` on the card (rather than grid centering) so that a card taller than the
// viewport stays reachable: centered grid/flex alignment overflows equally in both directions and puts
// the top of the card above the scroll origin, where no scrolling can bring it back.
export const Modal = styled.div`
  position: fixed;
  inset: 0;
  z-index: ${z.overlay};
  display: flex;
  overflow-y: auto;
  padding: 20px;
`

// Fixed, not absolute: the overlay is a scroll container now, and an absolute scrim is sized to its
// un-scrolled padding box — it would scroll away with the card, leaving a strip of undimmed page that
// also no longer answers the click-outside-to-close. The overlay is itself fixed, so inset: 0 still
// resolves to the viewport.
export const Scrim = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(22, 21, 24, 0.45);
`

// cart-pop-in is a global keyframe (index.css) shared with the cart popover — referenced by name.
export const Card = styled.div`
  position: relative;
  z-index: 1;
  margin: auto;
  width: 100%;
  /* Wide enough to fit all 4 credit bundles comfortably in a single row (the credits-server returns 4;
     the Figma mock showed 3 at ~180px). The pack tiles flex to share this width. */
  max-width: 700px;
  /* Flex-item auto-minimum can otherwise push the card past the viewport on a narrow screen. */
  min-width: 0;
  /* Never taller than the viewport (100% of the padded overlay): the no-funds state stacks a warning, a
     line list, 4 pack tiles, the total AND the Cancel/Buy pair, which overflows a laptop screen at 100%
     zoom and used to take the CTAs off-screen with it. The body absorbs the difference, and the clip is
     the backstop — a phase that forgets to make itself shrinkable is then visibly cut off at the card's
     edge instead of painting its buttons out on the scrim. */
  max-height: 100%;
  overflow: hidden;
  background: ${colors.white};
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
  border-bottom: 1px solid ${colors.gray4};
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
  font-weight: 700;
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
  color: ${colors.muted1};
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
  /* Shrink inside a viewport-capped card instead of overflowing it. Anything with its own flexible
     region (e.g. the cart's line list) gives up height first; this scroll is the last resort so the
     CTAs are always reachable on a short screen. */
  min-height: 0;
  overflow-y: auto;

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

// Resolves the creator address → profile display name; takes an `address` prop.
export const AssetCreator = styled(CreatorName)`
  font-size: 10px;
  line-height: 1.43;
  color: ${colors.muted};
`

export const AssetPrice = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;

  & span {
    font-size: 20.5px;
    font-weight: 600;
    color: ${colors.text2};
  }
`

export const AssetPriceIco = styled(CurrencyIcon)`
  width: 21.5px;
  height: 21.5px;
  background: ${colors.text2};
`

// Insufficient-funds banner: warm peach fill with a Brand/Purple warning glyph and soft-black-2 text.
export const Warning = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: center;
  background: rgba(255, 162, 90, 0.3);
  border-radius: ${radius.btn};
  padding: 12px 8px;
`

export const WarningText = styled.p`
  margin: 0;
  font-size: 14px;
  line-height: 1.334;
  color: ${colors.text2};

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
    border: 4px solid #ff7439;
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
  border-top: 1px solid ${colors.gray4};
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
  color: ${colors.muted1};
`

// Pinned to the bottom of the (scrollable) body, so the primary action of a state that outgrows a short
// viewport — no-funds stacks a warning, the asset, 4 pack tiles and the total above it — is never below
// the fold. The white fill hides the content scrolling underneath; the negative margin cancels its
// padding so the buttons keep their exact place in the states that don't scroll.
export const Ctas = styled.div`
  position: sticky;
  bottom: 0;
  display: flex;
  gap: 12px;
  margin-top: -8px;
  padding-top: 8px;
  background: ${colors.white};
`

export const Btn = styled.button`
  flex: 1;
  /* Let the CTAs shrink so their min-content can't widen the modal past the viewport on mobile. */
  min-width: 0;
  height: 46px;
  border-radius: ${radius.card};
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
  /* The design system's primary fill (Figma 738:53266 "BUY Button") — the same gradient the cart's
     CHECKOUT carries, so the two ends of the buy flow match. */
  &[data-variant='gradient'] {
    background: ${gradients.buyBtn};
    color: ${colors.softWhite};
  }
  &[data-variant='outline'] {
    background: transparent;
    border: 0.5px solid ${colors.text};
    color: ${colors.text2};
    font-size: 13px;
  }
  &[data-variant='ruby'] {
    background: ${colors.dclRed};
    color: ${colors.softWhite};
    font-size: 13px;
    letter-spacing: 0.61px;
  }
  // Solid accent fill (the error state's "Try again").
  &[data-variant='purple'] {
    background: ${colors.accent};
    color: ${colors.softWhite};
    font-size: 13px;
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

// Error state: a light-pink panel with the sad-robot art + reassuring copy.
export const BuyError = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  background: rgba(255, 201, 213, 0.5);
  border-radius: 16px;
  padding: 24px 16px;
`

export const BuyErrorArt = styled.img`
  width: 64px;
  height: 80px;
  object-fit: contain;
`

export const BuyErrorText = styled.p`
  margin: 0;
  text-align: center;
  font-size: 20px;
  line-height: 1.334;
  font-weight: 400;
  color: ${colors.text2};

  & b {
    font-weight: 700;
  }
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

// Indeterminate by default (a sliding shimmer). `data-step` is the determinate variant used by the
// cart's multi-item checkout: the width is set inline from step/total so it advances as each unit is
// authorized, instead of sliding.
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

  &[data-step] {
    animation: none;
    min-width: 12px;
    transition: width 0.35s ease;
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
