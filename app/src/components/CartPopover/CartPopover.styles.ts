import styled from '@emotion/styled'
import { css, keyframes } from '@emotion/react'
import { Link } from 'react-router-dom'
import { theme } from '~/styles/theme'
import { CurrencyIcon } from '~/components/CurrencyIcon'
import { CreatorBadge } from '~/components/CreatorBadge'
import { Icon } from '~/components/Icon'

const { colors, radius, gradients, font } = theme

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
  width: min(480px, 100vw);
  height: 100%;
  background: ${colors.white};
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
  border-bottom: 1px solid ${colors.gray4};
`

export const Title = styled.h2`
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  line-height: 1.6;
  color: ${colors.text};
`

export const Close = styled.button`
  flex: none;
  display: grid;
  place-items: center;
  width: 31px;
  height: 31px;
  border: 0;
  background: none;
  color: ${colors.text};
  cursor: pointer;
  border-radius: 8px;

  &:hover {
    background: ${colors.media};
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

export const Banner = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding: 12px;
  border-radius: 16px;
  background: rgba(193, 238, 207, 0.5);

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
  border: 1px solid ${colors.gray4};
  border-radius: ${radius.card};
  overflow: hidden;
  background: ${colors.white};

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
  width: 128px;
  align-self: stretch;
  background: ${colors.media};
  border-radius: ${radius.card};

  & img {
    width: 82%;
    height: 82%;
    object-fit: contain;
    filter: drop-shadow(0.6px 2.2px 2.8px rgba(0, 0, 0, 0.1));
  }
`

export const ThumbCheck = styled.span`
  position: absolute;
  top: 8px;
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
  color: ${colors.text};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding-right: 28px; /* clear the delete button */
`

// Creator subline: reuse CreatorBadge but drop its avatar for the text-only treatment.
export const By = styled(CreatorBadge)`
  margin-top: 4px;
  font-size: 10px;
  color: ${colors.muted};

  & [data-avatar] {
    display: none;
  }
  & [data-testid='creator-name'] {
    font-size: 10px;
    line-height: 1.43;
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
`

export const Qty = styled.span`
  min-width: 12px;
  text-align: center;
  font-size: 14px;
  font-weight: 500;
  line-height: 1.2;
  color: ${colors.text};
`

export const Price = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 24px;
  font-weight: 600;
  line-height: 1;
  color: ${colors.text2};
  white-space: nowrap;
`

export const Diamond = styled(CurrencyIcon)`
  width: 22px;
  height: 22px;
  color: ${colors.text};
`

export const Unavailable = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
  text-transform: uppercase;
  color: ${colors.text2};
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
  color: ${colors.accent};

  &:hover {
    color: ${colors.accentHover};
  }
  &:focus-visible {
    outline: 2px solid ${colors.accent};
    outline-offset: 2px;
  }
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
  color: ${colors.muted};
  cursor: pointer;

  &:hover {
    color: ${colors.err};
  }
`

export const Foot = styled.footer`
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  background: ${colors.white};
  border-top: 1px solid ${colors.gray4};
  box-shadow: 0 -4px 12px 2px rgba(0, 0, 0, 0.12);
`

export const TotalRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
`

export const TotalLabel = styled.span`
  font-size: 14px;
  font-weight: 600;
  line-height: 1.57;
  color: ${colors.muted1};
`

export const TotalVal = styled.span`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 24px;
  font-weight: 700;
  line-height: 1;
  color: ${colors.text};
`

export const TotalDiamond = styled(CurrencyIcon)`
  width: 28px;
  height: 28px;
  color: ${colors.text};
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

// data-variant='primary' (filled accent Link) | 'secondary' (magenta-outline button).
const ctaCss = css`
  display: flex;
  align-items: center;
  justify-content: center;
  height: 46px;
  border-radius: ${radius.card};
  font-family: ${font.sans};
  font-size: 13px;
  font-weight: 600;
  line-height: 24px;
  letter-spacing: 0.46px;
  text-transform: uppercase;
  text-decoration: none;
  cursor: pointer;

  /* The design system's pair (Figma 2187:453378/453391): the advancing action takes the primary
     gradient on the right, the dismissing one a hairline soft-black outline on the left. */
  &[data-variant='primary'] {
    border: 0;
    background: ${gradients.buyBtn};
    color: ${colors.white};
  }
  &[data-variant='primary']:hover,
  &[data-variant='primary']:active {
    background-image: linear-gradient(${colors.dclRed}, ${colors.dclRed});
  }
  &[data-variant='secondary'] {
    border: 0.5px solid ${colors.text};
    background: ${colors.white};
    color: ${colors.text};
  }
  /* Figma's outlined hover (738:53251): the fill inverts to soft-black-2 with a soft-white label. The
     white-fill hover the dark-field buttons take would be invisible on this light drawer. */
  &[data-variant='secondary']:hover {
    background: ${colors.text2};
    color: ${colors.softWhite};
  }
`

export const Cta = styled(Link)`
  ${ctaCss};
`
