import styled from '@emotion/styled'
import { css } from '@emotion/react'
import { Link } from 'react-router-dom'
import { theme } from '~/styles/theme'
import { Button } from '~/components/Button'
import { CreatorBadge } from '~/components/CreatorBadge'
import { CurrencyIcon } from '~/components/CurrencyIcon'
import { ErrorNotice } from '~/components/ErrorNotice'

const { colors, gradients, radius } = theme

// Cart-specific breakpoints from the Figma cart specs (two-column → single, then the fixed mobile
// summary bar) — deliberately not the canonical app breakpoints.
const twoCol = '@media (max-width: 1080px)'
const mobile = '@media (max-width: 880px)'

export const EmptyCta = styled(Button)`
  margin-top: 12px;
`

export const Checkout = styled.div`
  max-width: 1510px;
  margin: 0 auto;

  ${mobile} {
    padding-bottom: 188px; /* room for the fixed summary bar */
  }
`

export const Back = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 16px;
  padding: 0;
  border: 0;
  background: none;
  color: ${colors.text2};
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  cursor: pointer;
  transition: color 0.15s ease;

  &:hover {
    color: ${colors.accent};
  }
  & .ico {
    width: 18px;
    height: 18px;
  }

  ${mobile} {
    display: none;
  }
`

export const Body = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) 600px;
  gap: 24px;
  align-items: start;

  ${twoCol} {
    grid-template-columns: 1fr;
  }
`

export const Panel = styled.section`
  min-width: 0;
  background: #fff;
  border: 1px solid ${colors.line};
  border-radius: 16px;
  padding: 24px;

  ${mobile} {
    padding: 16px;
  }
`

export const PanelHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 24px;

  ${mobile} {
    margin-bottom: 16px;
    gap: 8px;
  }
`

// Mobile-only chevron before the title.
export const PanelBack = styled.button`
  display: none;

  ${mobile} {
    display: inline-flex;
    align-items: center;
    flex-shrink: 0;
    border: 0;
    background: none;
    padding: 0;
    color: ${colors.text};
    cursor: pointer;

    & .ico {
      width: 20px;
      height: 20px;
    }
  }
`

export const PanelTitle = styled.h1`
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  line-height: 1.2;
  color: ${colors.text};

  ${mobile} {
    flex: 1;
    min-width: 0;
    font-size: 16px;
  }
`

// Purple label + Amethyst GRADIENT border: a flat border-color can't hold a gradient, so it's a 2px
// transparent ring with the white fill clipped to padding-box and the gradient showing through the
// border-box (same technique as the asset card's hover border).
export const Fitting = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 40px;
  padding: 0 12px;
  border: 2px solid transparent;
  border-radius: ${radius.btn};
  background:
    linear-gradient(#fff, #fff) padding-box,
    ${gradients.amethyst} border-box;
  color: ${colors.accent};
  font-size: 13px;
  font-weight: 600;
  line-height: 24px;
  letter-spacing: 0.46px;
  text-transform: uppercase;
  white-space: nowrap;
  cursor: pointer;
  transition:
    box-shadow 0.15s ease,
    filter 0.15s ease;

  &:hover:not(:disabled) {
    box-shadow: 0 0 8px 0 rgba(165, 36, 179, 0.35);
  }
  &:active:not(:disabled) {
    filter: brightness(0.97);
  }
  &:disabled {
    opacity: 0.55;
    cursor: default;
  }

  ${mobile} {
    height: 36px;
    padding: 0 10px;
    font-size: 12px;
  }
`

export const List = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`

// A cart line = the Figma "Cart cards" component (thumbnail + name/creator + quantity + price).
export const Card = styled.div`
  position: relative;
  display: flex;
  align-items: stretch;
  gap: 12px;
  background: #fff;
  border: 1px solid #cfcdd4;
  border-radius: ${radius.card};
  overflow: hidden;
`

export const Thumb = styled.div`
  position: relative;
  flex-shrink: 0;
  width: 137px;
  height: 137px;
  background: ${colors.media};
  border-radius: ${radius.card};
  display: grid;
  place-items: center;
  overflow: hidden;

  & img {
    width: 83%;
    height: 83%;
    object-fit: contain;
    filter: drop-shadow(0.56px 2.25px 2.8px rgba(0, 0, 0, 0.1));
  }

  ${mobile} {
    width: 120px;
    height: 120px;
  }
`

export const ThumbLink = styled(Link)`
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
`

// Green "ready to buy" check overlaid on the thumbnail (decorative).
export const ThumbCheck = styled.span`
  position: absolute;
  top: 7.5px;
  left: 7.5px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #34ce77;
  display: grid;
  place-items: center;
`

export const Info = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 8px;
  padding: 16px 8px;

  ${mobile} {
    padding: 12px 4px 12px 0;
  }
`

export const Desc = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  padding-right: 64px; /* clear the top-right favourite + remove group */
`

// Rendered as a Link (navigates) or a plain div; only the anchor form gets the hover colour.
const nameCss = css`
  display: block;
  font-size: 16px;
  font-weight: 600;
  line-height: 1.2;
  color: ${colors.text};
  text-decoration: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  a&:hover {
    color: ${colors.accent};
  }

  ${mobile} {
    white-space: normal;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
  }
`

export const Name = styled.div`
  ${nameCss};
`

export const NameLink = styled(Link)`
  ${nameCss};
`

// Reuse CreatorBadge but drop its avatar for the text-only "By {creator}" treatment.
export const Creator = styled(CreatorBadge)`
  font-size: 10px;
  line-height: 1.43;
  color: ${colors.muted};

  & [data-avatar] {
    display: none;
  }
  & [data-testid='creator-name'] {
    font-size: 10px;
    line-height: 1.43;
  }
`

export const Foot = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-right: 8px;
`

// Quantity stepper — visual only: a cart line is a single unique listing (qty always 1).
export const Stepper = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px;
  border: 0.5px solid ${colors.muted2};
  border-radius: ${radius.pill};
`

export const Step = styled.button`
  display: grid;
  place-items: center;
  width: 16px;
  height: 16px;
  padding: 0;
  border: 0;
  background: none;
  color: ${colors.text};
  cursor: pointer;

  &:disabled {
    color: ${colors.muted2};
    cursor: default;
  }
  & svg {
    width: 16px;
    height: 16px;
  }
`

export const Qty = styled.span`
  min-width: 12px;
  font-size: 14px;
  font-weight: 500;
  line-height: 1.2;
  color: ${colors.text};
  text-align: center;
`

export const Price = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 24px;
  font-weight: 600;
  color: ${colors.text2};

  ${mobile} {
    font-size: 20px;
  }
`

export const PriceIco = styled(CurrencyIcon)`
  width: 24px;
  height: 24px;
  background: ${colors.accent};

  ${mobile} {
    width: 20px;
    height: 20px;
  }
`

export const PriceWas = styled.span`
  margin-left: 6px;
  font-size: 14px;
  font-weight: 500;
  color: ${colors.muted};
  text-decoration: line-through;
`

export const Actions = styled.div`
  position: absolute;
  top: 10px;
  right: 10px;
  display: flex;
  align-items: center;
  gap: 12px;
`

const iconBtn = css`
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  background: none;
  color: ${colors.muted};
  cursor: pointer;
  transition: color 0.12s ease;

  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
`

export const Fav = styled.button`
  ${iconBtn};

  &:hover:not(:disabled) {
    color: ${colors.text};
  }
  &[data-on] {
    color: ${colors.dclRed};
  }
`

export const Remove = styled.button`
  ${iconBtn};

  &:hover:not(:disabled) {
    color: ${colors.dclRed};
  }
`

export const Utils = styled.div`
  display: flex;
  gap: 20px;
  margin-top: 16px;

  & .link {
    font-size: 13px;
    color: ${colors.muted};
    font-weight: 600;
  }
  & .link:hover:not(:disabled) {
    color: ${colors.text};
  }
`

export const Summary = styled.aside`
  position: sticky;
  top: 172px;
  display: flex;
  flex-direction: column;
  background: #fff;
  border: 1px solid ${colors.line};
  border-radius: 16px;
  padding: 16px;

  ${twoCol} {
    position: static;
  }
  ${mobile} {
    position: fixed;
    left: 0;
    right: 0;
    top: auto;
    bottom: 0;
    z-index: 30;
    border: 0;
    border-radius: 16px 16px 0 0;
    box-shadow: 0 -4px 20px rgba(22, 21, 24, 0.12);
  }
`

export const SummaryTitle = styled.h2`
  margin: 0 0 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid #cfcdd4;
  font-size: 20px;
  font-weight: 600;
  color: ${colors.text};

  ${mobile} {
    margin-bottom: 12px;
    padding-bottom: 12px;
  }
`

export const SummaryBody = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`

export const TotalLine = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
`

export const TotalLabel = styled.span`
  font-size: 14px;
  font-weight: 600;
  color: #5e5b67;
`

export const TotalValue = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 24px;
  font-weight: 700;
  color: ${colors.text};
`

export const TotalIco = styled(CurrencyIcon)`
  width: 24px;
  height: 24px;
  background: ${colors.accent};
`

export const Cta = styled.button`
  width: 100%;
  height: 56px;
  border: 0;
  border-radius: ${radius.btn};
  background: ${gradients.amethyst};
  color: ${colors.softWhite};
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.046em;
  text-transform: uppercase;
  cursor: pointer;
  transition:
    background 0.15s ease,
    filter 0.15s ease;

  &:hover:not(:disabled) {
    background: ${colors.accent};
  }
  &:active:not(:disabled) {
    filter: brightness(0.95);
  }
  &:disabled {
    opacity: 0.6;
    cursor: default;
  }
`

const msg = css`
  margin: 0;
  font-size: 13px;
`

export const Msg = styled.p`
  ${msg};
`

export const MsgNotice = styled(ErrorNotice)`
  ${msg};
`

// The upsell rail wraps a shared CollectionCarousel (which supplies its own top margin).
export const Upsell = styled.div`
  margin-top: 8px;
`
