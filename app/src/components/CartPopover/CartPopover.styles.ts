import styled from '@emotion/styled'
import { keyframes } from '@emotion/react'
import { Link } from 'react-router-dom'
import { theme } from '~/styles/theme'
import { checkoutCtaCss } from '~/styles/cta.styles'
import { CurrencyIcon } from '~/components/CurrencyIcon'
import { CreatorBadge } from '~/components/CreatorBadge'
import { Icon } from '~/components/Icon'

const { colors, radius, font } = theme

const fade = keyframes`
  from { opacity: 0; }
  to { opacity: 1; }
`
const slide = keyframes`
  from { transform: translateX(100%); }
  to { transform: none; }
`

// Right-side slide-in cart drawer with a scrim (Figma "Add to cart drawer"). Portalled to <body>.
export const Root = styled.div`
  position: fixed;
  inset: 0;
  /* Above the global top nav + mobile filter sheet (9999) so it reads as a full-viewport modal. */
  z-index: 10000;
  display: flex;
  justify-content: flex-end;
`

export const Scrim = styled.div`
  position: absolute;
  inset: 0;
  background: rgba(22, 21, 24, 0.5);
  animation: ${fade} 0.16s ease;
`

export const Panel = styled.aside`
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  width: min(500px, 100vw);
  height: 100%;
  background: ${colors.accent};
  box-shadow: -8px 0 32px rgba(22, 21, 24, 0.18);
  /* Full right-to-left entrance, ease-in-out ("easy ease"). */
  animation: ${slide} 0.32s cubic-bezier(0.45, 0, 0.25, 1);
  font-family: ${font.sans};

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`

export const Head = styled.header`
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 16px;
  border-bottom: 2px solid ${colors.glassFaint};
`

export const Title = styled.h2`
  margin: 0;
  font-size: 20px;
  font-weight: 500;
  line-height: 1.6;
  color: ${colors.gray5};
`

export const Close = styled.button`
  flex: none;
  display: grid;
  place-items: center;
  width: 31px;
  height: 31px;
  border: 0;
  background: ${colors.overlayLight};
  color: ${colors.white};
  cursor: pointer;
  border-radius: ${radius.btn};

  &:hover {
    background: ${colors.overlay};
  }
`

export const Body = styled.div`
  flex: 1 1 auto;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 16px 16px 24px;
`

// Empty cart: the same message the /cart page shows, sized for the drawer — opening the cart icon on an
// empty basket lands here instead of navigating away from whatever the shopper was browsing.
export const Empty = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
`

export const Banner = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding: 12px;
  border-radius: 16px;
  /* The design's translucent mint, laid over white so the purple panel does not tint it. */
  background: linear-gradient(rgba(193, 238, 207, 0.5), rgba(193, 238, 207, 0.5)), ${colors.white};

  & p {
    margin: 0;
    font-size: 16px;
    line-height: 1.5;
    font-weight: 400;
    color: ${colors.text2};
  }
  & strong {
    font-weight: 600;
  }
`

export const BannerCheck = styled.span`
  flex: none;
  width: 20px;
  height: 20px;
`

export const List = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
`

// data-unavailable = the line's listing is no longer buyable (sold out / gone / expired): the media
// and description dim, and the price/stepper are replaced by a warning + a link to the item's resales.
// Still readable and removable; excluded from the drawer total and unit count.
export const Card = styled.li`
  position: relative;
  display: flex;
  gap: 12px;
  align-items: stretch;
  border-radius: ${radius.tile};
  overflow: hidden;
  background: ${colors.overlay};

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
  flex: none;
  display: grid;
  place-items: center;
  width: 137px;
  min-height: 139px;
  align-self: stretch;
  border: 1.5px solid transparent;
  border-radius: ${radius.tile};
  overflow: hidden;

  & img {
    width: 82%;
    height: 82%;
    object-fit: contain;
    filter: drop-shadow(0.6px 2.2px 2.8px rgba(0, 0, 0, 0.1));
  }
`

export const ThumbCheck = styled.span`
  position: absolute;
  bottom: 8px;
  left: 8px;
  width: 20px;
  height: 20px;
`

export const Info = styled.div`
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 8px;
`

export const Name = styled.div`
  font-size: 16px;
  font-weight: 600;
  line-height: 1.2;
  color: ${colors.softWhite};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding-right: 28px; /* clear the delete button */
`

export const By = styled(CreatorBadge)`
  margin-top: 4px;
  gap: 6px;
  font-size: 12px;
  color: ${colors.softWhite};

  & [data-avatar] {
    width: 20px;
    height: 20px;
    border: 1.43px solid ${colors.glassRing};
    background: ${colors.glassFaint};
  }
  & [data-testid='creator-name'],
  & [data-testid='creator-display'] {
    font-size: 12px;
    line-height: 1;
    color: ${colors.softWhite};
  }
`

export const RowBottom = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-right: 8px;
`

export const Stepper = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px;
  background: ${colors.glassFaint};
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
    color: ${colors.glassText};
    opacity: 0.5;
    cursor: default;
  }
`

export const Qty = styled.span`
  min-width: 12px;
  text-align: center;
  font-size: 14px;
  font-weight: 500;
  line-height: 1.2;
  color: ${colors.softWhite};
`

export const Price = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 24px;
  font-weight: 600;
  line-height: 1;
  color: ${colors.softWhite};
  white-space: nowrap;
`

export const Diamond = styled(CurrencyIcon)`
  width: 22px;
  height: 22px;
  color: ${colors.softWhite};
`

export const Unavailable = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
  text-transform: uppercase;
  color: ${colors.gray4};
`

export const Warn = styled(Icon)`
  color: #f48221;
`

export const Del = styled.button`
  position: absolute;
  top: 9px;
  right: 9px;
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  background: none;
  color: ${colors.softWhite};
  cursor: pointer;

  &:hover {
    color: ${colors.dclRed};
  }
`

export const Foot = styled.footer`
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  background: ${colors.drawerFoot};
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-top: 2px solid ${colors.glassFaint};
  box-shadow: 0 -4px 12px 2px rgba(0, 0, 0, 0.12);
`

export const TotalRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
`

export const TotalLabel = styled.span`
  font-size: 24px;
  font-weight: 600;
  line-height: 1.57;
  color: ${colors.softWhite};
`

export const TotalVal = styled.span`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 24px;
  font-weight: 600;
  line-height: 1;
  color: ${colors.softWhite};
`

export const TotalDiamond = styled(CurrencyIcon)`
  width: 22px;
  height: 22px;
  color: ${colors.softWhite};
`

// Figma (2187:451640) sits the two CTAs side by side, each taking half the row.
export const Ctas = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;

  & > * {
    flex: 1 1 0;
    min-width: 0;
  }
`

export const Cta = styled(Link)`
  ${checkoutCtaCss};
`

// The dismiss half of the pair. A BUTTON, not a link: it goes nowhere — it just closes the popover — and a
// link that navigates to nothing is a link that reads as broken to a keyboard or screen-reader user.
export const CtaButton = styled.button`
  ${checkoutCtaCss};
`
