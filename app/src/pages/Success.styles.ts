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
  /* Its own stacking context, above the confetti layer (z-index 0). Needed because z-index is inert without
     a position, so the content would otherwise sit below the burst regardless of order. */
  position: relative;
  z-index: 1;
  max-width: 895px;
  width: 100%;
  margin: 0 auto;
  /* Grows into the page shell's leftover height so the light band below reaches the footer. Needs
     .page[data-route="/success"] to be a flex column. */
  flex: 1 0 auto;
  padding: 32px 12px 64px;
  min-height: 72vh;

  /* The confirmation is a LIGHT surface on the shop's purple field — the same full-bleed band the cart
     paints (see pages/Cart.styles.ts Top). The negative top eats .page's own padding so the band starts
     flush under the sub-nav. Its z-index sits alongside the confetti layer's, and ::before paints first,
     so the burst still rains over it. */
  &::before {
    content: '';
    position: absolute;
    top: -28px;
    bottom: 0;
    left: 50%;
    width: 100vw;
    transform: translateX(-50%);
    background: ${colors.media};
    z-index: -1;
  }

  ${narrow} {
    &::before {
      top: -16px;
    }
  }
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

// Green success banner: rounded mint card with the 60px check beside the copy — stacked above it, and
// borderless, once the row no longer fits.
export const Banner = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 24px 16px;
  background: #dcf3e4;
  border: 1px solid #34ce77;
  border-radius: 16px;

  ${narrow} {
    flex-direction: column;
    border: 0;
  }
`

export const BannerCheck = styled.span`
  flex-shrink: 0;
  width: 60px;
  height: 60px;
  line-height: 0;
`

export const BannerText = styled.p`
  margin: 0;
  max-width: 640px;
  text-align: center;
  font-size: 20px;
  line-height: 1.334;
  color: ${colors.text2};

  & b {
    font-weight: 700;
  }

  ${narrow} {
    font-size: 17px;
  }
`

// One bordered card holding every row; on a narrow screen the card chrome moves to the rows themselves,
// which read better as separate tiles than as a long divided list.
export const List = styled.div`
  display: flex;
  flex-direction: column;
  padding: 24px;
  background: ${colors.white};
  border: 1px solid ${colors.gray4};
  border-radius: 16px;

  ${narrow} {
    gap: 12px;
    padding: 0;
    background: none;
    border: 0;
  }
`

export const ListRow = styled.div`
  display: flex;
  flex-direction: column;

  ${narrow} {
    padding: 16px;
    background: ${colors.white};
    border: 1px solid ${colors.gray4};
    border-radius: 16px;
  }
`

// Hairline between rows — only between items, never above the first, and never on the tiled layout.
export const Divider = styled.span`
  display: block;
  height: 1px;
  margin: 12px 0;
  background: ${colors.gray4};

  ${narrow} {
    display: none;
  }
`

// The topped-up credit bundle that landed with the purchase (buy credits + item together), shown as a
// light-purple pill above the item list.
export const Credits = styled.div`
  position: relative;
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

  ${narrow} {
    margin-bottom: 0;
  }
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

// Thumbnail · name+creator · price. Narrow drops the price out of the right edge and stacks it under
// the creator, beside a thumbnail that spans both rows — hence a grid rather than a flex row.
export const Row = styled.div`
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 24px;

  ${narrow} {
    grid-template-columns: auto 1fr;
    gap: 16px;

    & [data-thumb] {
      grid-row: 1 / span 2;
    }
    & [data-info] {
      grid-column: 2;
      grid-row: 1;
      align-self: end;
    }
    & [data-price] {
      grid-column: 2;
      grid-row: 2;
      align-self: start;
      margin-top: 4px;
    }
  }
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
  justify-content: center;
  gap: 4px;
`

export const RowName = styled.div`
  font-weight: 700;
  font-size: 20px;
  line-height: 1.3;
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
  font-size: 13px;

  & [data-avatar] {
    display: none;
  }
`

export const RowPrice = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px;
  font-weight: 700;
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
  background: ${colors.text2};
`

// CTA row: ghost MY ASSETS + ruby TRY IN WORLD, each flexing to fill. Stays side-by-side on mobile.
export const Ctas = styled.div`
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: flex-end;
  margin-top: 4px;
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
    background: ${colors.white};
    border: 1px solid ${colors.text};
    color: ${colors.text};
  }
  &[data-variant='ghost']:hover {
    background: ${colors.text2};
    color: ${colors.softWhite};
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
    gap: 8px;
    padding: 0 12px;
    font-size: 13px;
  }
`

export const Cta = styled.button`
  ${ctaCss};
`

export const CtaLink = styled.a`
  ${ctaCss};
`

// The glyph carries its own rounded-square plate (fill + hairline), so this only reserves the box.
export const CtaJump = styled.span`
  display: inline-flex;
  flex-shrink: 0;
  line-height: 0;
`
