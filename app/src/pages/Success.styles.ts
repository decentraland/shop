import styled from '@emotion/styled'
import { css } from '@emotion/react'
import { theme } from '~/styles/theme'
import { CurrencyIcon } from '~/components/CurrencyIcon'
import { CreatorBadge } from '~/components/CreatorBadge'

const { colors, radius } = theme

// The post-checkout page. The confirmed screen (Done and the pieces under it) is the pixel-perfect
// Figma layout; the other settlement states (processing / finalizing / failed / timed-out) reuse the
// simple centered Status column. Its own narrow breakpoint — the rows collapse well before `sm`.
const narrow = '@media (max-width: 600px)'

export const Root = styled.div`
  max-width: 895px;
  margin: 0 auto;
  padding: 32px 12px;
  min-height: 72vh;
`

export const Status = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  justify-content: center;
  min-height: 60vh;
`

// Composes the global `spinner` class for the animation; this only sizes and positions it.
export const Spinner = styled.span`
  margin: 4px auto 8px;
  width: 40px;
  height: 40px;
`

export const Title = styled.h1`
  font-size: clamp(30px, 4vw, 42px);
  font-weight: 800;
  letter-spacing: -0.02em;
  margin: 20px 0 8px;
`

export const Sub = styled.p`
  font-size: 18px;
  color: #4b4b57;
  margin: 0 0 22px;
`

// data-receipt right-aligns the row on the confirmed screen (where it holds just the receipt link).
export const Links = styled.div`
  display: flex;
  gap: 18px;
  justify-content: center;
  margin: 0 0 20px;

  &[data-receipt] {
    justify-content: flex-end;
    margin: 0;
  }
`

export const Receipt = styled.a`
  display: inline-block;
  margin: 0;
  color: ${colors.accent};
  font-weight: 600;
  font-size: 14px;
  text-decoration: none;
`

export const Actions = styled.div`
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  justify-content: center;
`

export const Done = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
`

// Green success banner: rounded card, mint fill + green border, 60px check + copy.
export const Banner = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 24px 16px;
  background: #e0f7e7;
  border: 1px solid #34ce77;
  border-radius: 16px;
`

export const BannerCheck = styled.span`
  flex-shrink: 0;
  width: 60px;
  height: 60px;
  line-height: 0;
`

export const BannerText = styled.p`
  flex: 1;
  margin: 0;
  text-align: center;
  font-size: 20px;
  line-height: 1.334;
  color: ${colors.text2};

  & b {
    font-weight: 700;
  }
`

// Bordered card wrapping the purchased-item rows.
export const List = styled.div`
  display: flex;
  flex-direction: column;
  padding: 24px;
  background: #fff;
  border: 1px solid ${colors.gray4};
  border-radius: 16px;
`

export const ListRow = styled.div`
  display: flex;
  flex-direction: column;
`

// Hairline between rows — only between items, never above the first.
export const Divider = styled.span`
  display: block;
  height: 1px;
  margin: 12px 0;
  background: ${colors.gray4};
`

// The topped-up credit bundle that landed with the purchase (buy credits + item together), shown as a
// light-purple pill above the item list.
export const Credits = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 109px;
  margin-bottom: 12px;
  padding: 8px 24px;
  border-radius: ${radius.btn};
  background: #f4e9ff;
  color: ${colors.text};
`

export const CreditsIco = styled(CurrencyIcon)`
  width: 30px;
  height: 30px;
  color: ${colors.text};
`

export const CreditsText = styled.p`
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  margin: 0;
`

export const CreditsAmount = styled.span`
  font-size: 24px;
  font-weight: 700;
  text-transform: capitalize;
`

export const CreditsAdded = styled.span`
  font-size: 14px;
  font-weight: 400;
`

export const Row = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`

export const RowThumb = styled.div`
  position: relative;
  flex-shrink: 0;
  width: 137px;
  height: 137px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${colors.media};
  border: 0.134px solid ${colors.muted2};
  border-radius: ${radius.btn};
  overflow: hidden;

  & img {
    width: 83%;
    height: 83%;
    object-fit: contain;
    filter: drop-shadow(0.56px 2.24px 2.8px rgba(0, 0, 0, 0.1));
  }

  ${narrow} {
    width: 96px;
    height: 96px;
  }
`

// "Purchased" check badge in the thumbnail corner.
export const RowCheck = styled.span`
  position: absolute;
  top: 8px;
  left: 8px;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${colors.dclRed};
  border-radius: ${radius.chip};
  line-height: 0;
`

export const RowInfo = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px;
`

export const RowName = styled.div`
  font-weight: 600;
  font-size: 20px;
  line-height: 1.57;
  color: ${colors.text};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  ${narrow} {
    font-size: 16px;
  }
`

// "× N" quantity badge beside the name when a primary line was bought in multiples.
export const RowQty = styled.span`
  margin-left: 8px;
  font-weight: 600;
  font-size: 13px;
  color: ${colors.muted};
`

// No avatar on the success rows (the design shows just "By {name}"); the badge renders it elsewhere.
export const RowCreator = styled(CreatorBadge)`
  position: relative;
  z-index: 1;
  color: ${colors.muted};
  font-size: 10px;

  & [data-avatar] {
    display: none;
  }
`

export const RowPrice = styled.div`
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px;
  font-weight: 600;
  font-size: 21px;
  color: ${colors.text2};
  white-space: nowrap;

  ${narrow} {
    font-size: 18px;
  }
`

export const RowPriceIco = styled(CurrencyIcon)`
  width: 22px;
  height: 22px;
`

// CTA row: ghost MY ASSETS + ruby TRY IN WORLD, right-aligned, each flexing to fill.
export const Ctas = styled.div`
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: flex-end;

  ${narrow} {
    flex-direction: column-reverse;
  }
`

// data-variant='ghost' (accent outline) | 'ruby' (filled DCL red). Cta is the in-app button; CtaLink is
// the same treatment for an off-app destination (Jump in) that needs a real anchor.
const ctaCss = css`
  flex: 1;
  min-width: 0;
  height: 48px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 0 24px;
  border-radius: ${radius.btn};
  font-weight: 600;
  font-size: 15px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  text-decoration: none;
  cursor: pointer;
  transition:
    filter 0.15s ease,
    background 0.15s ease;

  &[data-variant='ghost'] {
    background: transparent;
    border: 2px solid ${colors.accent};
    color: ${colors.accent};
  }
  &[data-variant='ghost']:hover {
    background: rgba(105, 31, 169, 0.06);
  }
  &[data-variant='ruby'] {
    background: ${colors.dclRed};
    border: 0;
    color: ${colors.softWhite};
  }
  &[data-variant='ruby']:hover {
    filter: brightness(0.95);
  }

  ${narrow} {
    width: 100%;
    flex: none;
  }
`

export const Cta = styled.button`
  ${ctaCss};
`

export const CtaLink = styled.a`
  ${ctaCss};
`

export const CtaJump = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 2.5px solid rgba(252, 252, 252, 0.5);
  border-radius: ${radius.btn};
  line-height: 0;
`
