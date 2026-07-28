import styled from '@emotion/styled'
import { css } from '@emotion/react'
import { theme } from '~/styles/theme'
import { Chip } from '~/styles/chip.styles'
import { CurrencyIcon } from '~/components/CurrencyIcon'

const { colors, radius, media } = theme

// Open secondary listings for the current item, shown below the main detail. Shop (credit-buyable)
// resales are first-class rows with Add to cart + Buy; classic (MANA) orders are price-discovery-only
// rows that link out.
export const Root = styled.section`
  margin-top: 40px;
`

export const Head = styled.div`
  margin-bottom: 16px;
`

export const Title = styled.h2`
  font-size: 22px;
  font-weight: 700;
  color: ${colors.text};
`

export const Subtitle = styled.p`
  margin: 4px 0 0;
  font-size: 14px;
  color: ${colors.muted};
`

export const List = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  border-top: 1px solid ${colors.line};
`

// A divider row (no card box): the seller AVATAR leads, then their name + serial, then price + Buy
// pushed to the right edge. data-legacy is the classic (MANA) treatment — dashed, no fill.
export const Row = styled.li`
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 4px;
  border-bottom: 1px solid ${colors.line};

  &[data-legacy] {
    background: transparent;
    border-style: dashed;
  }

  ${media.maxWidth('mobile')} {
    /* Stack: seller identity on its own row, then price + actions on a second row below. */
    flex-wrap: wrap;
    gap: 12px;
  }
`

// The seller identity: big circular avatar + name/serial. Takes the free space so price/actions align to
// the right edge. WhoLink is the same block as a button, used when the seller resolves to a storefront.
const whoCss = css`
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
  flex: 1 1 auto;
  text-align: left;

  ${media.maxWidth('mobile')} {
    flex: 1 1 100%;
  }
`

export const Who = styled.div`
  ${whoCss};
`

export const WhoLink = styled.button`
  ${whoCss};
  padding: 0;
  border: 0;
  background: transparent;
  font: inherit;
  cursor: pointer;

  &:hover [data-name] {
    text-decoration: underline;
  }
`

// The seller avatar disc. `Ava` is the real image; `AvaBox` is the same disc for the non-image fallbacks
// (data-letter = the initial-letter tile, data-empty = a bare placeholder). The placeholder fill is
// gray-5 (the neutral the cards/cart use) — the original CSS pointed at an undefined `var(--skeleton)`,
// so the disc rendered transparent.
const avaCss = css`
  width: 52px;
  height: 52px;
  border-radius: 50%;
  object-fit: cover;
  background: ${colors.media};
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
`

export const Ava = styled.img`
  ${avaCss};
`

export const AvaBox = styled.span`
  ${avaCss};

  &[data-letter] {
    color: #fff;
    font-weight: 700;
    font-size: 21px;
  }
`

export const Ident = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
`

export const Name = styled.span`
  font-weight: 700;
  font-size: 16px;
  color: ${colors.text};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
`

export const Serial = styled.span`
  font-size: 14px;
  color: ${colors.muted};

  &[data-muted] {
    font-weight: 600;
  }
`

export const Issued = styled.span`
  color: ${colors.text2};
  font-weight: 600;
`

// Your own listing: a muted, non-interactive chip in place of Buy / Add-to-cart (you can't buy it).
export const OwnChip = styled(Chip)`
  font-size: 13px;
  font-weight: 600;
  color: ${colors.muted};
  background: ${colors.chip};
`

export const Price = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
  font-weight: 700;
  font-size: 17px;
  color: ${colors.text};

  ${media.maxWidth('mobile')} {
    margin-left: 0;
  }
`

export const Diamond = styled(CurrencyIcon)`
  width: 18px;
  height: 18px;
`

export const Approx = styled.span`
  color: ${colors.muted};
  font-weight: 600;
`

export const Actions = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;

  /* Classic rows carry no price element, so push the outbound link to the right edge. */
  [data-legacy] & {
    margin-left: auto;
  }

  ${media.maxWidth('mobile')} {
    flex: 1 1 100%;
    margin-left: auto;
  }
`

const actionBtn = css`
  height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 0 16px;
  border-radius: ${radius.btn};
  font-weight: 600;
  font-size: 14px;
  cursor: pointer;
  border: 0;
  transition: filter 0.15s ease;

  &:hover:not(:disabled) {
    filter: brightness(1.15);
  }

  ${media.maxWidth('mobile')} {
    flex: 1 1 auto;
    height: 44px;
  }
`

export const Add = styled.button`
  ${actionBtn};
  background: ${colors.blackBtn};
  color: ${colors.softWhite};

  &:disabled {
    opacity: 0.55;
    cursor: default;
  }
`

export const Buy = styled.button`
  ${actionBtn};
  background: ${colors.brandViolet};
  color: #fff;
`

// "See more" pager under the list — a full-width bar revealing the next page of resales.
export const More = styled.button`
  display: block;
  width: 100%;
  margin: 12px 0 0;
  height: 48px;
  padding: 0 20px;
  border-radius: ${radius.btn};
  border: 0;
  background: ${colors.chip};
  color: ${colors.text};
  font-weight: 600;
  font-size: 15px;
  cursor: pointer;
  transition: filter 0.15s ease;

  &:hover {
    filter: brightness(0.96);
  }
`

// Classic (MANA) group rows use a compact id column instead of the seller identity.
export const IdCol = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex: 1 1 auto;
`

// Classic (MANA) group: visually distinct — a "classic marketplace" chip and an outbound link instead of
// cart/buy (the credits rail can't fulfill these).
export const Legacy = styled.div`
  margin-top: 24px;
`

export const LegacyHead = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-bottom: 10px;
`

export const LegacyTitle = styled.span`
  font-weight: 700;
  font-size: 15px;
  color: ${colors.text2};
`

export const LegacyNote = styled.span`
  font-size: 13px;
  color: ${colors.muted};
`

export const LegacyChip = styled(Chip)`
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: ${colors.muted};
`

export const ViewMarket = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 40px;
  padding: 0 14px;
  border-radius: ${radius.btn};
  border: 1px solid ${colors.lineStrong};
  color: ${colors.accent};
  font-weight: 600;
  font-size: 14px;
  text-decoration: none;

  &:hover {
    background: ${colors.chip};
  }

  ${media.maxWidth('mobile')} {
    flex: 1 1 auto;
    height: 44px;
  }
`
