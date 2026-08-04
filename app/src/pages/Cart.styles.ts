import styled from '@emotion/styled'
import { css } from '@emotion/react'
import { Link } from 'react-router-dom'
import { theme } from '~/styles/theme'
import { CreatorBadge } from '~/components/CreatorBadge'
import { CurrencyIcon } from '~/components/CurrencyIcon'
import { ErrorNotice } from '~/components/ErrorNotice'
import { Icon } from '~/components/Icon'

const { colors, radius } = theme

// Cart-specific breakpoints from the Figma cart specs (two-column → single, then the fixed mobile
// summary bar) — deliberately not the canonical app breakpoints.
const twoCol = '@media (max-width: 1080px)'
const mobile = '@media (max-width: 880px)'

export const Checkout = styled.div`
  max-width: 1510px;
  margin: 0 auto;
  /* Grows into the page's leftover height and passes it down to Upsell, so the white cross-sell band ends at
     the footer rather than leaving a gray strip. Needs .page[data-route="/cart"] to be a flex column. */
  width: 100%;
  flex: 1 0 auto;
  display: flex;
  flex-direction: column;

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
  color: ${colors.softWhite};
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  cursor: pointer;
  transition: color 0.15s ease;

  &:hover {
    color: ${colors.gray4};
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
  grid-template-columns: minmax(0, 1fr) 615px;
  gap: 24px;
  align-items: start;

  ${twoCol} {
    grid-template-columns: 1fr;
  }
`

// Groups the breadcrumb + the two-column body; no background of its own (the gray comes from body).
export const Top = styled.div`
  position: relative;
  /* The gray band is 733px in Figma (1553-317103) — taller than the panels inside it, deliberately. Without
     this it collapsed to the panels' height, and the page shell's own viewport-filling min-height then padded
     the page out BELOW the cross-sell, so a strip of gray showed under "You might also like" instead of the
     footer. Giving the band its designed height puts the leftover space where the design wants it. */
  min-height: 733px;

  ${mobile} {
    /* The single-column layout is already taller than the desktop band, and the fixed summary bar sits over
       the bottom of it — a floor here would only add empty gray. */
    min-height: 0;
  }
`

// The left column = TWO stacked white cards, 12px apart, both rounded-16 on the gray page.
export const Left = styled.div`
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
`

// Header card: "Cart: N Items" on the left, Fitting Room on the right.
export const HeadCard = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  padding: 12px 12px 12px 24px;

  ${mobile} {
    gap: 8px;
    padding: 12px;
  }
`

// Items card: the cart-card list, 24px padding all round so the last line has breathing room.
export const Panel = styled.section`
  min-width: 0;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  padding: 24px;

  ${mobile} {
    padding: 16px;
  }
`

// Empty cart: the same white-card-on-gray shell as the populated cart (Panel), with a centered cart
// glyph, message and a purple CTA.
export const CartEmpty = styled(Panel)`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 24px;
  min-height: 420px;
  padding: 48px 16px;
  text-align: center;
  color: ${colors.softWhite};

  ${theme.media.maxWidth('mobile')} {
    min-height: 320px;
    padding: 32px 16px;
  }
`

export const CartEmptyText = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding-bottom: 16px;
`

export const CartEmptyTitle = styled.p`
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  line-height: 1.6;

  ${theme.media.maxWidth('mobile')} {
    font-size: 20px;
  }
`

export const CartEmptyBody = styled.p`
  margin: 0;
  font-size: 20px;
  font-weight: 400;
  line-height: 1.6;

  ${theme.media.maxWidth('mobile')} {
    font-size: 16px;
  }
`

export const CartEmptyCta = styled(Link)`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 310px;
  max-width: 100%;
  height: 56px;
  padding: 0 12px;
  border-radius: ${radius.card};
  background: linear-gradient(180deg, #ff7439 0%, #ff2d55 100%);
  color: ${colors.softWhite};
  font-size: 15px;
  font-weight: 600;
  line-height: 24px;
  letter-spacing: 0.46px;
  text-transform: uppercase;
  text-decoration: none;
  transition: filter 0.15s ease;

  &:hover {
    filter: brightness(1.08);
  }
  &:focus-visible {
    outline: 2px solid ${colors.softWhite};
    outline-offset: 2px;
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
    color: ${colors.softWhite};
    cursor: pointer;

    & .ico {
      width: 20px;
      height: 20px;
    }
  }
`

export const PanelTitle = styled.h1`
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.57;
  color: ${colors.softWhite};

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
    linear-gradient(${colors.white}, ${colors.white}) padding-box,
    linear-gradient(180deg, #ff7439 0%, #ff2d55 100%) border-box;
  color: ${colors.text};
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
    box-shadow: 0 0 8px 0 rgba(255, 116, 57, 0.45);
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
  gap: 24px;
`

// A cart line = the Figma "Cart cards" component (thumbnail + name/creator + quantity + price).
// data-unavailable = the line's listing is no longer buyable (sold out / gone / expired): the media
// and description dim, and the price/stepper are replaced by a warning + a link to the item's resales.
// Still readable and removable; excluded from the total and from checkout.
export const Card = styled.div`
  position: relative;
  display: flex;
  align-items: stretch;
  gap: 12px;
  background: rgba(20, 7, 32, 0.45);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: ${radius.card};
  overflow: hidden;

  &[data-unavailable] [data-thumb] {
    opacity: 0.5;
  }
  &[data-unavailable] [data-check] {
    display: none;
  }
  &[data-unavailable] [data-desc] {
    opacity: 0.7;
  }
`

export const Thumb = styled.div`
  position: relative;
  flex-shrink: 0;
  width: 137.5px;
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
  color: ${colors.softWhite};
  text-decoration: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  a&:hover {
    color: ${colors.gray4};
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
  color: ${colors.gray4};

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
  border: 0.5px solid rgba(255, 255, 255, 0.6);
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
  color: ${colors.softWhite};
  cursor: pointer;

  &:disabled {
    color: rgba(255, 255, 255, 0.4);
    cursor: default;
  }
`

export const Qty = styled.span`
  min-width: 12px;
  font-size: 14px;
  font-weight: 500;
  line-height: 1.2;
  color: ${colors.softWhite};
  text-align: center;
`

export const Price = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  /* Always right-aligned: with a stepper present space-between handles it; for secondary/unique lines
     (no stepper) the auto margin keeps the lone price on the right instead of falling to the left. */
  margin-left: auto;
  font-size: 24px;
  font-weight: 600;
  color: ${colors.softWhite};

  ${mobile} {
    font-size: 20px;
  }
`

export const PriceIco = styled(CurrencyIcon)`
  width: 24px;
  height: 24px;
  background: ${colors.softWhite};

  ${mobile} {
    width: 20px;
    height: 20px;
  }
`

export const PriceWas = styled.span`
  margin-left: 6px;
  font-size: 14px;
  font-weight: 500;
  color: ${colors.gray4};
  text-decoration: line-through;
`

export const Actions = styled.div`
  position: absolute;
  top: 9px;
  right: 7px;
  display: flex;
  align-items: flex-start;
  gap: 12px;
`

export const Unavailable = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
  text-transform: uppercase;
  color: ${colors.softWhite};
`

export const Warn = styled(Icon)`
  color: #f48221;
`

export const Resales = styled(Link)`
  font-size: 12px;
  font-weight: 600;
  line-height: 24px;
  letter-spacing: 0.46px;
  text-transform: uppercase;
  text-decoration: underline;
  color: ${colors.softWhite};

  &:hover {
    color: ${colors.gray4};
  }
  &:focus-visible {
    outline: 2px solid ${colors.softWhite};
    outline-offset: 2px;
  }
`

// "Creator" chip on a primary (mint) line — Figma "Tag-Creator".
export const CreatorTag = styled.span`
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 4px;
  border-radius: ${radius.chip};
  background: rgba(255, 255, 255, 0.16);
  font-size: 10px;
  font-weight: 400;
  line-height: 14px;
  color: ${colors.softWhite};
`

// The glyph keeps the design's leaf size (11.31 × 10.94) rather than a square icon box.
export const CreatorTagIco = styled(Icon)`
  width: 11.31px;
  height: 10.94px;
  background: ${colors.softWhite};
`

const iconBtn = css`
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  background: none;
  color: ${colors.gray4};
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
    color: ${colors.white};
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
    color: ${colors.gray4};
    font-weight: 600;
  }
  & .link:hover:not(:disabled) {
    color: ${colors.white};
  }
`

export const Summary = styled.aside`
  position: sticky;
  top: 172px;
  display: flex;
  flex-direction: column;
  background: rgba(255, 255, 255, 0.08);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
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
    background: #2b0e44;
    box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.35);
  }
`

export const SummaryTitle = styled.h2`
  margin: 0 0 24px;
  padding-bottom: 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.3);
  font-size: 24px;
  font-weight: 600;
  color: ${colors.softWhite};

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

// The summary's total row — Figma "Price".
export const TotalLine = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
`

export const TotalLabel = styled.span`
  font-size: 14px;
  font-weight: 600;
  line-height: 1.57;
  color: ${colors.gray4};
`

export const TotalValue = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 24px;
  font-weight: 700;
  color: ${colors.softWhite};
`

// Total + the exchange rate stacked under it, both flush right.
export const TotalSide = styled.span`
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  justify-content: center;
  gap: 4px;
`

export const TotalRate = styled.span`
  font-size: 12px;
  font-weight: 400;
  line-height: 1;
  color: ${colors.gray4};
`

export const TotalIco = styled(CurrencyIcon)`
  width: 30px;
  height: 30px;
  background: ${colors.softWhite};
  -webkit-mask-size: 24px 24px;
  mask-size: 24px 24px;
  -webkit-mask-position: left center;
  mask-position: left center;
`

export const Cta = styled.button`
  width: 100%;
  height: 56px;
  border: 0;
  border-radius: ${radius.btn};
  background: linear-gradient(180deg, #ff7439 0%, #ff2d55 100%);
  color: ${colors.softWhite};
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.046em;
  text-transform: uppercase;
  cursor: pointer;
  transition: filter 0.15s ease;

  &:hover:not(:disabled) {
    filter: brightness(1.08);
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
  color: ${colors.softWhite};
`

export const MsgNotice = styled(ErrorNotice)`
  ${msg};
`

// The upsell rail wraps a shared CollectionCarousel (which supplies its own top margin).
// The cross-sell sits on WHITE while the page above is gray: a full-bleed white band starts at the
// panels' bottom and extends down through the page's 80px bottom padding so the white meets the footer
// with no gray strip. The top margin sits ABOVE that band, so it shows the gray page background.
export const Upsell = styled.div`
  position: relative;
  flex: 1 0 auto;
  margin-top: 48px;
  /* Dark-theme test: the cross-sell sits directly on the purple field (the old design put it on a
     full-bleed white band). */
  padding: 47px 0 24px;

  & section {
    margin-top: 0;
  }
`
