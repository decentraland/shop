import styled from '@emotion/styled'
import { css, keyframes } from '@emotion/react'
import { Link } from 'react-router-dom'
import { theme } from '~/styles/theme'
import { CurrencyIcon } from '~/components/CurrencyIcon'
import { CreatorBadge } from '~/components/CreatorBadge'

const { colors, radius, font } = theme

const fade = keyframes`
  from { opacity: 0; }
  to { opacity: 1; }
`
const slide = keyframes`
  from { transform: translateX(24px); opacity: 0.4; }
  to { transform: none; opacity: 1; }
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
  background: #fff;
  box-shadow: -8px 0 32px rgba(22, 21, 24, 0.18);
  animation: ${slide} 0.22s ease;
  font-family: ${font.sans};
`

export const Head = styled.header`
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 16px;
  border-bottom: 1px solid #cfcdd4;
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

export const Card = styled.li`
  position: relative;
  display: flex;
  gap: 12px;
  align-items: stretch;
  border: 1px solid #cfcdd4;
  border-radius: ${radius.card};
  overflow: hidden;
  background: #fff;
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
  color: ${colors.rarity};
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
  background: #fff;
  border-top: 1px solid #cfcdd4;
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
  color: #5e5b67;
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
  color: ${colors.rarity};
`

export const Ctas = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`

// data-variant='primary' (filled accent Link) | 'secondary' (magenta-outline button).
const ctaCss = css`
  display: flex;
  align-items: center;
  justify-content: center;
  height: 46px;
  border-radius: ${radius.btn};
  font-family: ${font.sans};
  font-size: 15px;
  font-weight: 600;
  line-height: 24px;
  letter-spacing: 0.46px;
  text-transform: uppercase;
  text-decoration: none;
  cursor: pointer;

  &[data-variant='primary'] {
    border: 0;
    background: ${colors.accent};
    color: ${colors.softWhite};
  }
  &[data-variant='primary']:hover {
    background: #58198c;
  }
  &[data-variant='secondary'] {
    border: 2px solid ${colors.magenta};
    background: #fff;
    color: ${colors.accent};
  }
  &[data-variant='secondary']:hover {
    background: rgba(198, 64, 205, 0.06);
  }
`

export const Cta = styled(Link)`
  ${ctaCss};
`

export const CtaButton = styled.button`
  ${ctaCss};
`
