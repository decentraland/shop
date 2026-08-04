import styled from '@emotion/styled'
import { NavLink } from 'react-router-dom'
import { theme } from '~/styles/theme'
import { CurrencyIcon } from '~/components/CurrencyIcon'
import { Icon } from '~/components/Icon'

const { colors, gradients, radius, media } = theme

const mobile = media.maxWidth('mobile')
// One row cannot hold the tab strip, a usable search field AND the balance/credits/cart cluster below
// ~900px: something has to be cut, and every candidate is a control someone needs. So from `lg` down the
// row wraps into the stacked layout mobile already used — search and tabs each get their own line — and
// only the ≤768 cosmetics (shorter navbar, smaller type) stay in the `mobile` blocks below. This is also
// the breakpoint where the browse sidebar becomes the Filters drawer, so the two shifts happen together.
const stacked = media.maxWidth('lg')

export const Subnav = styled.div`
  position: sticky;
  top: 92px;
  z-index: 40;
  display: flex;
  align-items: center;
  gap: 24px;
  height: 66px;
  /* 54px matches the ui2 Navbar's desktop side padding so the sub-nav aligns with the top nav. */
  padding: 0 54px;
  background: ${colors.white};
  border-bottom: 1px solid ${colors.line};

  ${stacked} {
    height: auto;
    flex-wrap: wrap;
    gap: 12px;
    padding: 12px 54px 0;
  }

  ${mobile} {
    top: 64px;
    padding: 12px 16px 0;
  }
`

// While the row is shared (above `lg`) the tab strip is its FLEXIBLE part. Its links are nowrap, so
// without min-width: 0 the strip's min-content width (~612px) is rigid: the sub-nav then squeezes the
// search field to nothing and, once even that runs out, pushes the whole page into horizontal overflow.
// The strip scrolls instead — the mask on its right edge is what tells you there is more to reach, since
// the scrollbar is hidden. Below `lg` the strip has its own full-width row and none of this applies.
export const Tabs = styled.nav`
  display: flex;
  gap: 40px;
  height: 100%;
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }

  /* Between lg and xl the strip is always narrower than its content, so fade its right edge: the
     scrollbar is hidden and a label cut off mid-word just reads as a bug. Not applied above xl, where
     the strip is whole and a fade would be a hint to nowhere. */
  ${media.maxWidth('xl')} {
    mask-image: linear-gradient(to right, #000 calc(100% - 24px), transparent);
  }

  ${stacked} {
    mask-image: none;
  }

  & a {
    display: flex;
    align-items: center;
    height: 100%;
    white-space: nowrap;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    font-size: 15px;
    font-weight: 600;
    color: ${colors.muted2};
    border-bottom: 4px solid transparent;
  }
  & a:hover {
    color: ${colors.text};
  }
  & a.active {
    color: ${colors.text};
    border-bottom-color: ${colors.text};
  }

  ${stacked} {
    order: 6;
    flex: 1 0 100%;
    height: auto;
  }

  ${mobile} {
    gap: 16px;

    & a {
      height: auto;
      font-size: 12px;
      letter-spacing: 0.038em;
      border-bottom-width: 4px;
      padding: 8px 0 6px;
    }
  }
`

// position:relative is the offset parent for the SearchDropdown's absolutely-positioned panel.
export const Search = styled.div`
  position: relative;
  margin-left: auto;
  /* 240px of field is the FLOOR (flex-shrink: 0 makes the basis hard), growing into whatever slack the
     row has left up to the 496px design width. The field used to be plain flexible, so the other items
     shrank it with the window until only the magnifier was left — visually a search "icon", but not a
     control that opens anything, so the search was simply gone. The tab strip yields instead. */
  flex: 1 0 240px;
  max-width: 496px;
  display: flex;
  align-items: center;
  gap: 10px;
  background: rgba(0, 0, 0, 0.05);
  border: 1px solid ${colors.lineStrong};
  border-radius: ${radius.pill};
  padding: 0 16px;
  height: 40px;

  & input {
    border: 0;
    outline: 0;
    width: 100%;
    font-size: 15px;
    background: transparent;
    color: ${colors.text};
  }
  & input::placeholder {
    color: ${colors.muted};
  }

  ${stacked} {
    order: 5;
    /* Own row here — full width, so the desktop floor and cap must not hold it back. */
    flex: 1 0 100%;
    max-width: none;
    margin-left: 0;
  }

  ${mobile} {
    height: 34px;

    & input {
      font-size: 14px;
    }
  }
`

export const SearchClear = styled.button`
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  flex: 0 0 auto;
  /* The UA button padding (1px 6px) leaves an 8px content box — narrower than the 14px glyph, which
     then start-aligns instead of centering and sits 3px right of the round hover fill. */
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.08);
  color: ${colors.muted};
  font-size: 15px;
  line-height: 1;
  cursor: pointer;

  &:hover {
    background: rgba(0, 0, 0, 0.16);
    color: ${colors.text};
  }
`

// Polygon MANA balance chip — same metrics as the credits balance so the pair reads as one row. Only
// rendered when the wallet holds MANA (see NavBar).
export const Mana = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 40px;
  padding: 0 4px;
  border-radius: 4px;
  color: ${colors.text2};
  font-weight: 600;
  font-size: 16px;
  letter-spacing: -0.03em;
  white-space: nowrap;
`

export const ManaIco = styled.img`
  width: 18px;
  height: 18px;
  display: block;
`

// Persistent credit balance chip (transparent per Figma).
export const Balance = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 40px;
  padding: 0 4px;
  border-radius: 4px;
  background: transparent;
  color: ${colors.text2};
  font-weight: 600;
  font-size: 16px;
  letter-spacing: -0.03em;
  white-space: nowrap;

  ${stacked} {
    order: 2;
  }
`

export const BalanceIco = styled(CurrencyIcon)`
  width: 20px;
  height: 20px;
  color: ${colors.text};
`

// Sized loading placeholder; the shimmer comes from the global `skeleton` class it also carries.
export const BalanceSkel = styled.span`
  display: inline-block;
  width: 26px;
  height: 16px;
  border-radius: 5px;
`

export const Credits = styled(NavLink)`
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 40px;
  padding: 0 16px;
  border-radius: ${radius.btn};
  background: ${gradients.amethyst};
  color: ${colors.softWhite};
  font-weight: 600;
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.046em;
  white-space: nowrap;
  transition: filter 0.15s ease;

  /* Hover ring (Figma): a gradient stroke OUTSIDE the button with a gap in between (the page shows
     through the gap). Drawn as a masked gradient ring — a plain outline can't take a gradient. */
  &::before {
    content: '';
    position: absolute;
    inset: -6px;
    border-radius: calc(${radius.btn} + 6px);
    padding: 2px;
    background: ${gradients.amethyst};
    -webkit-mask:
      linear-gradient(#fff 0 0) content-box,
      linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor;
    mask:
      linear-gradient(#fff 0 0) content-box,
      linear-gradient(#fff 0 0);
    mask-composite: exclude;
    opacity: 0;
    transition: opacity 0.15s ease;
    pointer-events: none;
  }

  &:hover {
    filter: brightness(1.08);
  }
  &:hover::before {
    opacity: 1;
  }
  &:active {
    filter: brightness(0.95);
  }

  ${stacked} {
    order: 1;
    margin-right: auto;
  }
`

export const CreditsIco = styled(CurrencyIcon)`
  width: 20px;
  height: 20px;
`

// Favorites heart. `.active` is applied by NavLink when on /my-favorites.
export const Fav = styled(NavLink)`
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: ${radius.btn};
  color: ${colors.text2};
  transition:
    background 0.12s ease,
    color 0.12s ease;

  &:hover {
    background: ${colors.media};
  }

  ${stacked} {
    order: 3;
  }
`

// Stacks the outline heart under the solid one so the fill can flood the outline in place.
export const FavIcons = styled.span`
  position: relative;
  width: 28px;
  height: 28px;
`

// The outline stroke — fades out as the solid heart arrives (delayed to land as the fill reaches full),
// so the active (on /my-favorites) state is a clean solid glyph, not a fill inside a ring.
export const FavOutline = styled(Icon)`
  transition: opacity 160ms ease;

  .active & {
    opacity: 0;
    transition: opacity 140ms ease 160ms;
  }

  @media (prefers-reduced-motion: reduce) {
    &,
    .active & {
      transition: none;
    }
  }
`

// The solid black heart grows from the centre when the favourites route is active: springy pop in,
// quick scale-out on leave.
export const FavFill = styled(Icon)`
  position: absolute;
  inset: 0;
  color: ${colors.text};
  transform: scale(0);
  transform-origin: center;
  transition: transform 200ms ease-in;
  pointer-events: none;

  .active & {
    transform: scale(1);
    transition: transform 280ms cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  @media (prefers-reduced-motion: reduce) {
    &,
    .active & {
      transition: none;
    }
  }
`

// position:relative anchors CartPopover's absolutely-positioned `.cart-pop`.
export const CartWrap = styled.div`
  position: relative;

  ${stacked} {
    order: 4;
  }
`

export const Cart = styled.button`
  position: relative;
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  background: transparent;
  border-radius: ${radius.btn};
  color: ${colors.text2};
  border: 0;
  padding: 0;
  font: inherit;
  cursor: pointer;
  transition: background 0.12s ease;

  &:hover {
    background: ${colors.media};
  }
`

// Filled while the cart holds something: the solid cart grows from the centre when the first item
// lands and stays filled until the cart empties, so the icon reads as "cart has stuff". Mirrors the
// favourites heart's persistent fill.
export const CartIcons = styled.span`
  position: relative;
  width: 28px;
  height: 28px;
`

export const CartOutline = styled(Icon)`
  transition: opacity 160ms ease;

  [data-filled] & {
    opacity: 0;
    transition: opacity 140ms ease 160ms;
  }

  @media (prefers-reduced-motion: reduce) {
    &,
    [data-filled] & {
      transition: none;
    }
  }
`

export const CartFill = styled(Icon)`
  position: absolute;
  inset: 0;
  color: ${colors.text};
  transform: scale(0);
  transform-origin: center;
  transition: transform 200ms ease-in;
  pointer-events: none;

  [data-filled] & {
    transform: scale(1);
    transition: transform 280ms cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  @media (prefers-reduced-motion: reduce) {
    &,
    [data-filled] & {
      transition: none;
    }
  }
`

export const CartBadge = styled.span`
  position: absolute;
  top: -4px;
  right: -4px;
  background: ${colors.brandViolet};
  color: ${colors.white};
  font-size: 12px;
  font-weight: 600;
  border-radius: 999px;
  min-width: 20px;
  height: 20px;
  display: grid;
  place-items: center;
  padding: 0 5px;
  border: 2px solid ${colors.white};
`
