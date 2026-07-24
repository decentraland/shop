import styled from '@emotion/styled'
import { theme } from '~/styles/theme'

const { colors } = theme

// The filter popover anchored under a FilterPanel trigger. `data-variant` switches the checkbox-grid
// (rarity) vs the price-range layout. Shared by FilterBar (rarity) + Collection/Creator (price).
// `cart-pop-in` is a global keyframe (index.css).
export const Pop = styled.div`
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  z-index: 36;
  background: #fff;
  border: 1px solid ${colors.line};
  border-radius: 12px;
  box-shadow: 0 12px 32px rgba(22, 21, 24, 0.12);
  padding: 8px;
  animation: cart-pop-in 0.16s ease;

  &[data-variant='rarity'] {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2px;
    min-width: 250px;
  }
  &[data-variant='price'] {
    min-width: 240px;
    padding: 12px;
  }
`

export const Check = styled.label`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 14px;
  text-transform: capitalize;
  cursor: pointer;

  &:hover {
    background: #f5f4f7;
  }
  & input {
    accent-color: ${colors.accent};
    width: 15px;
    height: 15px;
  }
`

export const PriceRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;

  & input {
    width: 100%;
    border: 1px solid ${colors.lineStrong};
    border-radius: 10px;
    padding: 8px 10px;
    font-size: 14px;
  }
  & input:focus {
    outline: 0;
    border-color: ${colors.accent};
  }
  & input::-webkit-outer-spin-button,
  & input::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
`

export const Hint = styled.p`
  margin: 8px 2px 0;
  color: ${colors.muted};
  font-size: 12px;
`
