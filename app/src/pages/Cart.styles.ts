import styled from '@emotion/styled'
import { css } from '@emotion/react'
import { Link } from 'react-router-dom'
import { theme } from '~/styles/theme'
import { CreatorBadge } from '~/components/CreatorBadge'
import { CurrencyIcon } from '~/components/CurrencyIcon'
import { ErrorNotice } from '~/components/ErrorNotice'
import { Icon } from '~/components/Icon'

const { colors, gradients, radius } = theme

// Cart-specific breakpoints from the Figma cart specs (two-column → single, then the fixed mobile
// summary bar) — deliberately not the canonical app breakpoints.
const TWO_COL_MAX = 1080
const MOBILE_MAX = 880
const twoCol = `@media (max-width: ${TWO_COL_MAX}px)`
const mobile = `@media (max-width: ${MOBILE_MAX}px)`
// Just above the single-column switch, where the summary is still a fixed 615px and the cart column is
// whatever is left — about 334px. Derived from TWO_COL_MAX so the two can never drift apart.
const narrowTwoCol = `@media (min-width: ${TWO_COL_MAX + 1}px) and (max-width: 1180px)`

export const Checkout = styled.div`
  max-width: 1510px;
  margin: 0 auto;
  /* Grows into the page's leftover height and passes it down to Upsell, so a short cart leaves its slack
     BELOW the cross-sell rail rather than inside the band. Needs .page[data-route="/cart"] to be a flex
     column. */
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
  /* Gray 5, not Gray 4: this row leads the band, above the cards and with nothing but the wash behind it,
     where Gray 4 drops under AA. */
  color: ${colors.gray5};
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  cursor: pointer;
  transition: color 0.15s ease;

  &:hover {
    color: ${colors.softWhite};
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

// Groups the breadcrumb + the two-column body over a full-bleed band, which is how Figma draws the cart
// (1551:315391, 1922x798). The band used to be the light gray of the old marketplace; on the shop's purple
// field it is a translucent wash instead, so the region still reads as one surface without reintroducing
// white. Reaching the viewport edges needs the 100vw/50% dance; the negative top eats .page's own padding
// so the band starts flush under the sticky sub-nav instead of leaving a seam.
export const Top = styled.div`
  position: relative;
  /* The band's own breathing room, above the breadcrumb and under the panels, which is what sets how big
     the section reads. Deliberately generous rather than hugging the cards: the zone is the checkout, and
     at the old 48px it read as a strip squeezed between the sub-nav and the cross-sell rail.

     No min-height floor: Figma's 733px was sized for an opaque band that had to reach the cross-sell, and
     keeping it here only pushed the rail below down behind a stretch of empty wash. The band tracks its
     content, and this padding is what surrounds it. */
  padding-top: 58px;
  padding-bottom: 107px;

  /* The wash that gives the cards a floor instead of leaving them on the bare field.

     Every surface on this page is ONE step of this same token, never two: translucent fills stack, and
     the previous pass had a 40% panel over a 40% band compositing to 64%, with the item card on top of
     both reaching 78% — which is what read as heavy. At one step each, a panel on the band lands at 36%
     and the item card adds nothing (see Card). Depth comes from borders and spacing, not from piling up
     black. */
  &::before {
    content: '';
    position: absolute;
    top: -28px;
    bottom: 0;
    left: 50%;
    width: 100vw;
    transform: translateX(-50%);
    background: ${colors.overlayLight};
    z-index: 0;
  }

  /* The light ink is set here so descendants inherit it; the cards below carry the contrast. */
  color: ${colors.softWhite};
  & > * {
    position: relative;
    z-index: 1;
  }

  ${mobile} {
    /* The fixed summary bar already reserves room at the bottom on mobile (see Checkout), and a tall band
       on a short viewport costs more than it gives. */
    padding-top: 24px;
    padding-bottom: 32px;

    &::before {
      top: -16px; /* .page's mobile padding */
    }
  }
`

// The left column: one translucent card, rounded-16 on the band. It held two stacked cards until the
// header moved inside the list (see PanelHead), which is why it is a column with nothing to space out.
export const Left = styled.div`
  min-width: 0;
  display: flex;
  flex-direction: column;
`

// Header row: "Cart: N Items" on the left, Fitting Room on the right. It used to be a card of its own,
// stacked above the list with a 12px gap. One card holds both now: two translucent panels a few pixels
// apart read as a seam rather than as two things, and the header has no meaning away from the list it
// counts.
export const PanelHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  /* Pulled out to the card's edges, then the padding is put back on the row itself, so the row reads as
     the card's own header strip rather than as content indented inside it. No rule under it: the gap
     below already separates the header from the list, and the line only added weight. */
  margin: -24px -24px 16px;
  padding: 12px 12px 12px 24px;

  ${mobile} {
    gap: 8px;
    margin: -16px -16px 12px;
    padding: 8px 16px;
  }
`

// The cart card: the header row (see PanelHead) above the cart-card list, 24px padding all round so
// the last line has breathing room.
export const Panel = styled.section`
  min-width: 0;
  background: ${colors.overlayLight};
  border-radius: 16px;
  padding: 24px;

  ${mobile} {
    padding: 16px;
  }
`

// Empty cart: the panel is the empty-state card itself, sized to its content.
export const CartEmpty = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
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

// Soft-black outline button.
export const Fitting = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 40px;
  padding: 0 12px;
  border: 2px solid ${colors.softWhite};
  border-radius: ${radius.btn};
  background: none;
  color: ${colors.softWhite};
  font-size: 13px;
  font-weight: 600;
  line-height: 24px;
  letter-spacing: 0.46px;
  text-transform: uppercase;
  white-space: nowrap;
  cursor: pointer;
  transition:
    background 0.15s ease,
    filter 0.15s ease;

  /* Mixed from currentColor so the wash cannot drift from the border colour. */
  &:hover:not(:disabled) {
    background: color-mix(in srgb, currentColor 6%, transparent);
  }
  &:active:not(:disabled) {
    filter: brightness(0.97);
  }
  &:disabled {
    opacity: 0.55;
    cursor: default;
  }

  /* Mobile keeps the full 40px button and thins the outline to 1px (1182:236892) rather than shrinking
     the type, which had it reading smaller than the row title beside it. */
  ${mobile} {
    border-width: 1px;
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
  /* No fill: the line is drawn by its border alone, over whatever the panel behind it is. A third
     translucent layer here is what pushed this card to 78% black in the previous pass (see Top), and it
     buys nothing — the white design separated these lines with a border too, the card being white on a
     white panel. */
  border: 1px solid ${colors.cardLine};
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
  /* The thumb is what sets the row's height — nothing else in the line is taller — so this is where a
     cart line is made to feel less cramped. A quarter above Figma's 137.5x137, which read small against
     a row this wide, and small is what a buyer sees of an item they are about to pay for. */
  width: 172px;
  height: 171px;
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

  /* Just above the single-column breakpoint the summary is still a fixed 615px, so the cart column is only
     ~334px and a 172px thumb left the name and the price nothing — the price clipped outright. Step the
     thumb down over that range. BELOW the breakpoint there is no problem: the grid is one column there and
     the row gets the full width. Measured with the longest real price (11K, quantity 2): clipping is gone
     from 1120px up, and at 1181px the full-size thumb fits again with room to spare. */
  ${narrowTwoCol} {
    width: 120px;
    height: 120px;
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

  /* Underline, not a colour change: the ink here is already softWhite, so the old hover colour matched
     the resting one and the link announced nothing on hover. */
  a&:hover {
    text-decoration: underline;
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
  /* The shared badge switches this to its dark ink on hover (badge.styles), which was drawn for a white
     card and lands around 1.1:1 here — the name disappears under the cursor. */
  &[data-link]:hover [data-testid='creator-name'] {
    color: ${colors.softWhite};
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
  border: 0.5px solid ${colors.cardLine};
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
    color: ${colors.gray4};
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

// "Creator" chip on a primary (mint) line — Figma "Tag-Creator".
export const CreatorTag = styled.span`
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 4px;
  border-radius: ${radius.chip};
  background: ${colors.glass};
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
    color: ${colors.softWhite};
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
    color: ${colors.softWhite};
  }
`

export const Summary = styled.aside`
  position: sticky;
  top: 172px;
  display: flex;
  flex-direction: column;
  background: ${colors.overlayLight};
  box-shadow: 0 1px 3px rgba(22, 21, 24, 0.06);
  border-radius: 16px;
  padding: 32px;

  /* PaymentCtas renders both here and inside the checkout modal, whose shell is still white, so its
     defaults were picked against white and only break on this card. Overridden in the summary's scope
     rather than in the component, so the modal keeps what works there.

     The focus ring is the blocking one: accent (#691fa9) against this card measures 1.2:1, and 1.65:1 on
     the mobile bar, where WCAG 1.4.11 asks 3:1 of a focus indicator — on the page's main action, for the
     one kind of user who depends on it. The shortfall note is the same muted-ink problem already fixed
     for Msg. */
  button:focus-visible {
    outline-color: ${colors.softWhite};
  }
  [data-testid='mana-shortfall-note'] {
    color: ${colors.gray4};
  }

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
    /* Square and hard-edged against the page (1182:236910): it is a bar docked to the bottom, not a sheet
       lifted off it. */
    border-radius: 0;
    /* Back to the compact padding: the desktop card's roomier one would make the docked bar taller than
       the space Checkout reserves for it, and the bar would cover the last cart line. */
    padding: 16px;
    /* Opaque, unlike the desktop card. This one is docked to the viewport and the whole cart scrolls
       underneath it, so a translucent fill showed the list through the total and the CTA — over one of
       the light item thumbnails, softWhite measured 1.72:1. The token is the field's bottom stop with
       this same wash composited in, so the bar matches where it sits. */
    background: ${colors.fieldBottomWashed};
    box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.25);
  }
`

export const SummaryTitle = styled.h2`
  margin: 0 0 32px;
  padding-bottom: 20px;
  border-bottom: 1px solid ${colors.cardLine};
  font-size: 24px;
  font-weight: 600;
  color: ${colors.softWhite};

  ${mobile} {
    margin-bottom: 12px;
    padding-bottom: 8px;
    font-size: 16px;
    line-height: 1.6;
  }
`

export const SummaryBody = styled.div`
  display: flex;
  flex-direction: column;
  gap: 28px;

  /* Same reason as Summary's padding: the mobile bar is docked and its height is budgeted for. */
  ${mobile} {
    gap: 12px;
  }
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
  background: ${gradients.buyBtn};
  color: ${colors.softWhite};
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.046em;
  text-transform: uppercase;
  cursor: pointer;
  transition: background-image 0.15s ease;

  /* Primary hover/pressed is the solid Primary red (Figma 738:53252 / 738:53262) — the gradient is
     the RESTING fill only. Painted as a flat GRADIENT, not a background-color: the shorthand can't
     interpolate background-image, so gradient -> colour dropped the image midway while the colour was
     still half transparent and the button visibly blinked. Same property both ends = a clean swap. */
  &:hover:not(:disabled),
  &:active:not(:disabled) {
    background-image: linear-gradient(${colors.dclRed}, ${colors.dclRed});
  }
  &:disabled {
    opacity: 0.6;
    cursor: default;
  }
`

const msg = css`
  margin: 0;
  font-size: 13px;

  /* These carry the global .muted class, whose ink was chosen against white — on the summary's card it
     measures 4.10:1, under AA. Matching the two-class specificity overrides it without !important. */
  &.muted {
    color: ${colors.gray4};
  }
`

export const Msg = styled.p`
  ${msg};
`

export const MsgNotice = styled(ErrorNotice)`
  ${msg};

  /* The shared notice was drawn against a white card: near-black message ink and the flat error red for
     the icon. On this translucent purple they measure 1.56:1 and 2.78:1 — the message is effectively
     invisible. It is the checkout failure sitting beside the CTA, announced with role="alert", so it has
     to survive the move off white. The icon keeps a red so the notice still reads as an error. */
  .error-notice__msg {
    color: ${colors.softWhite};
  }
  .error-notice__ico {
    color: ${colors.saleTag};
  }
`

// The upsell rail wraps a shared CollectionCarousel (which supplies its own top margin). It was always
// on the purple field; what changed is that the cart above it is too, so the seam this used to sit under
// is gone.
export const Upsell = styled.div`
  position: relative;
  flex: 1 0 auto;
  /* The padding is the whole gap from the top of the section to the heading; the shared carousel's own
     top margin is zeroed below so the two don't stack. It is the only gap now — the 48px margin that used
     to sit on top of it was clearing the old opaque band's edge, which no longer needs clearing. */
  padding: 32px 0 24px;

  & section {
    margin-top: 0;
  }
`
