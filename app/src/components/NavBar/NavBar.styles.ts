import styled from '@emotion/styled'
import { NavLink } from 'react-router-dom'
import { theme } from '~/styles/theme'
import { CurrencyIcon } from '~/components/CurrencyIcon'

const { colors, gradients, radius, media } = theme

const mobile = media.maxWidth('mobile')

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

  ${mobile} {
    top: 64px;
    height: auto;
    flex-wrap: wrap;
    gap: 12px;
    padding: 12px 16px 0;
  }
`

// The tab strip is the row's FLEXIBLE part. Its links are nowrap, so without min-width: 0 its
// min-content width (~612px) is rigid: the sub-nav then squeezes the search field to nothing and, once
// even that runs out, pushes the whole page into horizontal overflow. Letting the strip shrink and
// scroll instead keeps the search usable and the page at viewport width at every size.
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

  ${mobile} {
    order: 6;
    flex: 1 0 100%;
    height: auto;
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

  ${mobile} {
    order: 5;
    /* Own row here — full width, so the desktop cap must not hold it back. */
    flex: 1 0 100%;
    max-width: none;
    margin-left: 0;
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

  ${mobile} {
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

  &:hover {
    filter: brightness(1.08);
  }
  &:active {
    filter: brightness(0.95);
  }

  ${mobile} {
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
  &.active {
    color: ${colors.brandViolet};
  }

  ${mobile} {
    order: 3;
  }
`

// position:relative anchors CartPopover's absolutely-positioned `.cart-pop`.
export const CartWrap = styled.div`
  position: relative;

  ${mobile} {
    order: 4;
  }
`

export const Cart = styled.button`
  position: relative;
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  background: ${colors.media};
  border-radius: ${radius.btn};
  color: ${colors.text2};
  border: 0;
  padding: 0;
  font: inherit;
  cursor: pointer;
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
