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
  padding: 0 40px;
  background: #fff;
  border-bottom: 1px solid ${colors.line};

  ${mobile} {
    top: 64px;
    height: auto;
    flex-wrap: wrap;
    gap: 12px;
    padding: 12px 16px 0;
  }
`

export const Tabs = styled.nav`
  display: flex;
  gap: 40px;
  height: 100%;

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
    overflow-x: auto;
    scrollbar-width: none;

    &::-webkit-scrollbar {
      display: none;
    }
    & a {
      height: auto;
      font-size: 12px;
      letter-spacing: 0.038em;
      border-bottom-width: 4px;
      padding: 8px 0 6px;
    }
  }
`

// position:relative is the offset parent for the SearchDropdown's absolutely-positioned `.search-pop`.
export const Search = styled.div`
  position: relative;
  margin-left: auto;
  flex: 0 1 496px;
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
    flex: 1 0 100%;
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
  color: ${colors.accent};
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
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  border-radius: 999px;
  min-width: 20px;
  height: 20px;
  display: grid;
  place-items: center;
  padding: 0 5px;
  border: 2px solid #fff;
`
