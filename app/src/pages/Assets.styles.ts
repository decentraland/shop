import styled from '@emotion/styled'
import { theme } from '~/styles/theme'
import { CurrencyIcon } from '~/components/CurrencyIcon'

const { colors, radius, font, media } = theme

// The browse container/sidebar/main layout is shared with Collection + Creator.
export { Browse, Sidebar, Main } from '~/styles/browseLayout.styles'

export const Scrim = styled.div`
  ${media.maxWidth('lg')} {
    position: fixed;
    inset: 0;
    z-index: 9998;
    background: rgba(0, 0, 0, 0.4);
  }
`

// The drawer chrome (title + close X) and action bar only exist on mobile.
export const SidebarHead = styled.div`
  display: none;

  ${media.maxWidth('lg')} {
    position: sticky;
    top: 0;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: #fff;
    margin: 0 -16px 8px;
    padding: 16px 16px 12px;
    border-radius: 16px 16px 0 0;
  }
`

export const SidebarTitle = styled.span`
  ${media.maxWidth('lg')} {
    font-weight: 700;
    font-size: 18px;
    color: ${colors.text};
  }
`

export const SidebarClose = styled.button`
  ${media.maxWidth('lg')} {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: ${colors.chip};
    border: 0;
    font-size: 15px;
    line-height: 1;
    cursor: pointer;
    color: ${colors.text};
  }
`

export const SidebarFoot = styled.div`
  display: none;

  ${media.maxWidth('lg')} {
    display: flex;
    align-items: center;
    gap: 12px;
    position: sticky;
    bottom: 0;
    margin: 8px -16px 0;
    padding: 16px 16px calc(16px + env(safe-area-inset-bottom));
    background: #fff;
    box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.25);
    z-index: 1;
  }
`

export const Clear = styled.button`
  flex: 1;
  height: 40px;
  background: none;
  border: 0;
  border-radius: ${radius.btn};
  color: ${colors.accent};
  font-weight: 600;
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.035em;
  text-decoration: underline;
  cursor: pointer;
  white-space: nowrap;
`

export const Apply = styled.button`
  flex: 1;
  height: 40px;
  border: 0;
  border-radius: ${radius.btn};
  background: ${colors.accent};
  color: #fff;
  font-weight: 600;
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.035em;
  cursor: pointer;
`

export const SectionLabel = styled.div`
  font-family: ${font.sans};
  font-weight: 400;
  font-size: 12px;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: ${colors.text};
  margin: 0 4px 12px;
`

export const Divider = styled.div`
  height: 1px;
  background: ${colors.media};
  margin: 20px 0;
`

export const SectionToggle = styled.button`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  background: none;
  border: 0;
  padding: 0;
  cursor: pointer;
  margin-bottom: 12px;

  & [data-section-label] {
    margin: 0;
  }
`

export const RarityFilter = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 0 4px;
`

// data-on = selected rarity.
export const RarityCheck = styled.label`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 6px;
  border-radius: 8px;
  font-size: 14px;
  color: ${colors.text};
  text-transform: capitalize;
  cursor: pointer;

  &:hover {
    background: #f5f4f7;
  }
  &[data-on] {
    color: ${colors.accent};
    font-weight: 600;
  }
  & input {
    accent-color: ${colors.accent};
    width: 15px;
    height: 15px;
    flex: none;
  }
`

export const PriceFilter = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 0 4px;
`

export const PriceInputs = styled.div`
  display: flex;
  align-items: flex-end;
  gap: 8px;
`

export const PriceField = styled.label`
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  min-width: 0;
`

export const PriceFieldLabel = styled.span`
  font-family: ${font.sans};
  font-weight: 400;
  font-size: 12px;
  color: ${colors.muted};
`

export const PriceBox = styled.span`
  display: flex;
  align-items: center;
  gap: 6px;
  height: 42px;
  padding: 8px;
  border: 0.5px solid #000;
  border-radius: 8px;
  background: #fff;

  &:focus-within {
    border-color: ${colors.rarity};
  }
  & input {
    width: 100%;
    min-width: 0;
    border: 0;
    background: none;
    padding: 0;
    font-family: ${font.sans};
    font-size: 13px;
    color: ${colors.text};
  }
  & input:focus {
    outline: 0;
  }
  & input::-webkit-outer-spin-button,
  & input::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
`

export const PriceCoin = styled(CurrencyIcon)`
  width: 15px;
  height: 15px;
  color: ${colors.rarity};
  flex: none;
`

export const PriceTo = styled.span`
  padding-bottom: 12px;
  color: ${colors.muted};
  font-size: 13px;
`

// Dual-range slider: both inputs stack in the same box over the shared rail + selected-span fill.
// The fill reads --min-pct/--max-pct set inline on this element; only the thumbs take pointer events.
export const PriceSlider = styled.div`
  position: relative;
  height: 20px;

  & input[type='range'] {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 20px;
    margin: 0;
    -webkit-appearance: none;
    appearance: none;
    background: none;
    pointer-events: none;
  }
  & input[type='range']::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    pointer-events: auto;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #fff;
    border: 2px solid ${colors.rarity};
    box-shadow: 0 1px 3px rgba(22, 21, 24, 0.25);
    cursor: pointer;
  }
  & input[type='range']::-moz-range-thumb {
    pointer-events: auto;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #fff;
    border: 2px solid ${colors.rarity};
    box-shadow: 0 1px 3px rgba(22, 21, 24, 0.25);
    cursor: pointer;
  }
`

export const PriceTrack = styled.div`
  position: absolute;
  top: 50%;
  left: 0;
  right: 0;
  height: 3px;
  transform: translateY(-50%);
  background: ${colors.media};
  border-radius: 3px;
`

export const PriceFill = styled.div`
  position: absolute;
  top: 50%;
  height: 3px;
  transform: translateY(-50%);
  left: var(--min-pct, 0%);
  right: calc(100% - var(--max-pct, 100%));
  background: ${colors.rarity};
  border-radius: 3px;
`

export const PriceRange = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`

export const PriceRangeVal = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-family: ${font.sans};
  font-size: 13px;
  color: ${colors.text};
`

// data-variant='warn' reddens the market-rate-unavailable notice.
export const MarketBanner = styled.p`
  display: flex;
  align-items: center;
  gap: 10px;
  background: ${colors.rarityBg};
  color: ${colors.accent};
  border-radius: 12px;
  padding: 12px 16px;
  margin-bottom: 14px;
  font-weight: 600;
  font-size: 14px;

  &[data-variant='warn'] {
    background: rgba(211, 51, 51, 0.1);
    color: ${colors.err};
  }
`
