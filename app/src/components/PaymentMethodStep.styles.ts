import styled from '@emotion/styled'
import { theme } from '~/styles/theme'

// "Choose your payment method" step of the Buy Now flow (Figma Z0actRbZof0tDolIdxIL3A, node
// 1552-316605). Renders inside the shared .buy-modal__card, so this is the card's whole content:
// header, asset summary, the Credits/MANA option rows, and the Buy CTA. Matches the SellModal /
// BuyModal design language (560px feel, Inter, DCL tokens).

export const Root = styled.div`
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
  width: 20px;
  height: 20px;
  border: 0;
  background: none;
  cursor: pointer;
  color: ${theme.colors.text};

  &:disabled {
    opacity: 0.4;
    cursor: default;
  }
  &:focus-visible {
    outline: 2px solid ${theme.colors.accent};
    outline-offset: 2px;
  }
`

// Asset summary: 180px thumbnail beside the name / creator / price (Figma "Marketplace Cards").
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
    width: 83%;
    height: 83%;
    object-fit: contain;
    filter: drop-shadow(0.7px 2.9px 3.7px rgba(0, 0, 0, 0.1));
  }

  ${theme.media.down('mobile')} {
    width: 120px;
    height: 120px;
  }
`

export const AssetInfo = styled.div`
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 32px;
  padding: 8px;
`

export const AssetName = styled.p`
  margin: 0;
  font-family: ${theme.font.sans};
  font-weight: 600;
  font-size: 20px;
  line-height: 1.57;
  color: ${theme.colors.text};
  overflow: hidden;
  text-overflow: ellipsis;
`

// Wraps CreatorName (which renders its own <div>) so the "By {creator}" line picks up the caption style.
export const AssetBy = styled.div`
  > div {
    font-family: ${theme.font.sans};
    font-size: 10px;
    line-height: 1.43;
    color: ${theme.colors.muted};
  }
`

export const AssetPrice = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;

  .ico {
    width: 24px;
    height: 24px;
    background: ${theme.colors.text2};
  }
  span {
    font-family: ${theme.font.sans};
    font-weight: 600;
    font-size: 24px;
    color: ${theme.colors.text2};
  }
`

export const Options = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`

// One selectable payment method. Selected → warm "Flare" gradient border (Figma) over the row's fill;
// unselected → hairline gray border on white. Disabled (not enough MANA) → dimmed + not selectable.
export const OptionRow = styled.button`
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 12px 12px 12px 0;
  border-radius: 12px;
  border: 0.5px solid ${theme.colors.muted};
  background: ${theme.colors.white};
  cursor: pointer;
  text-align: left;
  font-family: ${theme.font.sans};

  &[data-selected='true'] {
    /* Flare gradient border (melon → ruby) painted over the row fill via the border-box trick, so the
       12px corners stay rounded (border-image can't clip them). Fill is gray-5 when selected. */
    background:
      linear-gradient(${theme.colors.media}, ${theme.colors.media}) padding-box,
      linear-gradient(120deg, #ffa25a 0%, #ffc95b 30%, ${theme.colors.dclRed} 100%) border-box;
    border: 3px solid transparent;
  }
  &[data-disabled='true'] {
    cursor: not-allowed;
    opacity: 0.55;
  }
  &:focus-visible {
    outline: 2px solid ${theme.colors.accent};
    outline-offset: 2px;
  }
`

export const LeftSlot = styled.div`
  flex: none;
  display: flex;
  align-items: center;
  padding: 9px;
`

// Custom checkbox — checked = dark fill + white tick; unchecked = hairline square (Figma MUI medium).
export const CheckBox = styled.span`
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border-radius: 4px;
  border: 2px solid ${theme.colors.muted2};
  background: ${theme.colors.white};

  &[data-checked='true'] {
    border-color: ${theme.colors.text};
    background: ${theme.colors.text};
  }
  .ico {
    width: 14px;
    height: 14px;
    background: ${theme.colors.white};
  }
`

export const Content = styled.div`
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
`

export const InfoGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 13px;
  min-width: 0;
`

export const Logo = styled.span`
  flex: none;
  display: grid;
  place-items: center;

  .ico {
    width: 32px;
    height: 32px;
    background: ${theme.colors.text2};
  }
`

export const TextBlock = styled.div`
  display: flex;
  flex-direction: column;
  min-width: 0;
`

export const Label = styled.span`
  font-family: ${theme.font.sans};
  font-weight: 700;
  font-size: 15px;
  line-height: 26px;
  letter-spacing: -0.2px;
  color: ${theme.colors.text2};
`

export const BalanceRow = styled.span`
  display: flex;
  align-items: center;
  gap: 4px;
  font-family: ${theme.font.sans};
  font-size: 12px;
  color: ${theme.colors.muted};

  .ico {
    width: 11px;
    height: 11px;
    background: ${theme.colors.text};
  }
`

export const BalanceValue = styled.span`
  font-size: 11px;
  color: ${theme.colors.text};
`

// The "Not enough MANA" hint that replaces the balance value when the row is disabled.
export const Hint = styled.span`
  font-family: ${theme.font.sans};
  font-size: 12px;
  font-weight: 600;
  color: ${theme.colors.dclRed};
`

export const Price = styled.div`
  flex: none;
  display: flex;
  align-items: center;
  gap: 6px;

  .ico {
    width: 20px;
    height: 20px;
    background: ${theme.colors.text2};
  }
  span {
    font-family: ${theme.font.sans};
    font-weight: 600;
    font-size: 20px;
    color: ${theme.colors.text2};
  }
`

export const BuyBtn = styled.button`
  width: 100%;
  height: 46px;
  border: 0;
  border-radius: 12px;
  cursor: pointer;
  background: ${theme.gradients.amethyst};
  color: ${theme.colors.softWhite};
  font-family: ${theme.font.sans};
  font-weight: 600;
  font-size: 15px;
  line-height: 24px;
  letter-spacing: 0.46px;
  text-transform: uppercase;

  &:hover:not(:disabled) {
    filter: brightness(1.05);
  }
  &:focus-visible {
    outline: 2px solid ${theme.colors.accent};
    outline-offset: 2px;
  }
  &:disabled {
    opacity: 0.6;
    cursor: default;
  }
`

// ---- MANA marks -------------------------------------------------------------------------------
// The MANA symbol is the marketplace's full-colour Polygon MANA logo, so it renders as an <img>
// (the mask-based Icon would flatten it to a monochrome tint). Three sizes to match the credits
// mark in each slot: row logo, balance line, price.

export const ManaLogo = styled.img`
  flex: none;
  width: 32px;
  height: 32px;
  display: block;
`

export const ManaMini = styled.img`
  width: 11px;
  height: 11px;
  display: block;
`

export const ManaPriceIco = styled.img`
  width: 20px;
  height: 20px;
  display: block;
`

// Two stacked marks for the combined row (credits over MANA), keeping the 32px logo footprint.
export const DualLogo = styled.span`
  flex: none;
  width: 32px;
  display: grid;
  gap: 2px;
  place-items: center;

  .ico {
    width: 15px;
    height: 15px;
    background: ${theme.colors.text2};
  }
  img {
    width: 15px;
    height: 15px;
    display: block;
  }
`

// The combined row's price: "◈ 40 + 300 MANA" on one line, same type scale as a single price.
export const SplitPrice = styled.div`
  flex: none;
  display: flex;
  align-items: center;
  gap: 4px;

  .ico {
    width: 18px;
    height: 18px;
    background: ${theme.colors.text2};
  }
  img {
    width: 18px;
    height: 18px;
    display: block;
  }
  span {
    font-family: ${theme.font.sans};
    font-weight: 600;
    font-size: 17px;
    color: ${theme.colors.text2};
  }
`

// The "+" between the two legs of a combined payment.
export const Plus = styled.span`
  font-family: ${theme.font.sans};
  font-weight: 600;
  font-size: 15px;
  color: ${theme.colors.muted};
`
