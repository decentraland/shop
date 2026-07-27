import styled from '@emotion/styled'
import { css } from '@emotion/react'
import { theme } from '~/styles/theme'
import { CurrencyIcon } from '~/components/CurrencyIcon'
import { Button } from '~/components/Button'
import { Icon } from '~/components/Icon'
import { Chip } from '~/styles/chip.styles'
import { CreatorBadge } from '~/components/CreatorBadge'
import { CollectionBadge } from '~/components/CollectionBadge'
import { SaleCountdown } from '~/components/SaleCountdown'

const { colors, radius, media } = theme

export const Detail = styled.div`
  max-width: 1721px;
  margin: 0 auto;

  ${media.maxWidth('lg')} {
    padding-bottom: 88px;
  }
`

export const Crumbs = styled.nav`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: ${colors.muted};
  margin-bottom: 24px;
`

export const CrumbLink = styled.button`
  background: none;
  border: 0;
  padding: 0;
  font: inherit;
  color: ${colors.muted};

  &:hover {
    color: ${colors.text};
  }
`

export const CrumbSep = styled.span`
  color: ${colors.muted2};
`

export const CrumbCurrent = styled.span`
  color: ${colors.text};
  font-weight: 600;
`

// Two-column hero: preview left (1045), info right (514), 48px gap. Inset vs the full-width breadcrumb.
export const Main = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1045fr) minmax(0, 514fr);
  gap: 48px;
  align-items: start;

  ${media.maxWidth('lg')} {
    grid-template-columns: 1fr;
    gap: 24px;
  }
`

// Preview panel + overlay chrome. Positions ItemPreview's parts (and the mobile fav/skeleton) via their
// `data-preview-*` / `data-fav-preview` hooks. The greedy `> *` fill is undone by the higher-specificity
// attribute rules so the pills/notes keep their intrinsic size (mirrors the pre-styled cascade).
export const Preview = styled.div`
  position: relative;
  aspect-ratio: 1045 / 752;
  border-radius: 16px;
  overflow: hidden;
  background: ${colors.media};

  ${media.maxWidth('lg')} {
    aspect-ratio: 1 / 1;
  }

  & iframe,
  & > * {
    width: 100%;
    height: 100%;
    border: 0;
    display: block;
  }

  /* Invisible viewport sentinel for the IntersectionObserver that pauses the preview off-screen.
     Absolute + pointer-events:none so it neither takes layout space (undoing the greedy child sizing
     above) nor blocks the preview controls. */
  & > [data-preview-viewport] {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 0;
  }

  & > [data-preview-toggle] {
    position: absolute;
    top: 16px;
    left: 16px;
    z-index: 2;
    width: auto;
    height: auto;
    display: inline-flex;
    gap: 2px;
    padding: 3px;
    background: rgba(255, 255, 255, 0.92);
    border: 1px solid ${colors.line};
    border-radius: 999px;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12);
  }

  & > [data-preview-controls] {
    position: absolute;
    bottom: 16px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 2;
    width: min(360px, 88%);
    height: auto;
    display: flex;
    align-items: center;
    background: rgba(255, 255, 255, 0.94);
    backdrop-filter: blur(6px);
    border: 1px solid ${colors.line};
    border-radius: ${radius.pill};
    padding: 6px 12px;
    box-shadow: 0 2px 10px rgba(22, 21, 24, 0.12);
  }

  & > [data-preview-note] {
    position: absolute;
    bottom: 14px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 2;
    width: auto;
    height: auto;
    max-width: 88%;
    margin: 0;
    text-align: center;
    background: rgba(22, 21, 24, 0.78);
    color: #fff;
    font-size: 12px;
    font-weight: 500;
    padding: 6px 12px;
    border-radius: 999px;
  }

  & > [data-preview-loading] {
    position: absolute;
    inset: 0;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    background: transparent;
  }

  & > [data-fav-preview] {
    display: none;
  }

  ${media.maxWidth('lg')} {
    & > [data-preview-toggle] {
      top: auto;
      left: auto;
      bottom: 12px;
      right: 12px;
      gap: 0;
      padding: 0;
      background: transparent;
      border: 0;
      box-shadow: 0 1px 4px rgba(22, 21, 24, 0.18);
      overflow: hidden;
    }
    & > [data-fav-preview] {
      display: grid;
      position: absolute;
      top: 12px;
      right: 12px;
      z-index: 3;
      width: 40px;
      height: 40px;
      background: rgba(255, 255, 255, 0.92);
      box-shadow: 0 1px 4px rgba(22, 21, 24, 0.18);
    }
    & > [data-fav-preview]:hover {
      background: #fff;
    }
  }
`

// Stub loader shown before the preview mounts (deep-link/refresh). Positioned by `Preview`.
export const PreviewLoading = styled.div``

// Inset:0 fill skeleton for the stub loader.
export const PreviewSkeleton = styled.span`
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border-radius: inherit;
`

export const Info = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0;
`

export const InfoHead = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;

  ${media.maxWidth('lg')} {
    order: 0;
  }
`

export const Title = styled.h1`
  font-size: 28px;
  font-weight: 600;
  line-height: 34px;
  color: ${colors.text2};

  ${media.maxWidth('lg')} {
    font-size: 20px;
    line-height: 24px;
  }
`

// Favourite heart. `data-fav-title` (in the title row, hidden on mobile) or `data-fav-preview`
// (overlaid on the preview, shown only on mobile — positioned by `Preview`).
export const Fav = styled.button`
  flex: none;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 0;
  background: ${colors.media};
  display: grid;
  place-items: center;
  color: ${colors.text2};
  cursor: pointer;
  transition:
    color 0.12s ease,
    background 0.12s ease;

  &:hover {
    background: ${colors.line};
  }
  &[data-on] {
    color: ${colors.dclRed};
  }

  ${media.maxWidth('lg')} {
    &[data-fav-title] {
      display: none;
    }
  }
`

export const Label = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0;
  color: ${colors.muted};
`

export const Chips = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 12px;

  ${media.maxWidth('lg')} {
    order: 1;
    margin-top: 10px;
  }
`

// PDP chip: taller and roomier than the shared base; the category/gender variant paints its own fill.
export const DetailChip = styled(Chip)`
  height: 24px;
  padding: 0 8px;
  gap: 3px;
  font-size: 13px;
  font-weight: 500;
  border-radius: 4px;
  letter-spacing: 0.02em;
  text-transform: uppercase;

  &[data-variant='cat'] {
    background: ${colors.chip};
    color: ${colors.text2};
  }
`

export const Section = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
`

export const Description = styled(Section)`
  margin-top: 15px;
  gap: 11px;

  ${media.maxWidth('lg')} {
    order: 3;
    margin-top: 20px;
  }
`

export const DescText = styled.p`
  margin: 0;
  color: ${colors.text2};
  font-size: 14px;
  line-height: 30px;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 4;
  overflow: hidden;

  &[data-expanded] {
    -webkit-line-clamp: unset;
    overflow: visible;
  }
`

export const DescToggle = styled.button`
  font-size: 13px;
  align-self: flex-start;
`

export const Meta = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 16px;
  margin-top: 32px;

  ${media.maxWidth('lg')} {
    order: 2;
    margin-top: 20px;
  }
`

export const MetaCol = styled.div`
  display: flex;
  flex-direction: column;
  gap: 15px;
  min-width: 0;

  &[data-collection] {
    align-items: flex-start;
  }
`

// PDP creator/collection badge: larger avatar + prominent purple link (overrides the compact default).
// Shared by both badge kinds, which both carry the same reach-in data hooks.
const badgeDetailCss = css`
  &[data-testid='creator'] {
    color: ${colors.accent};
    font-size: 14px;
    gap: 12px;
  }
  [data-avatar] {
    width: 48px;
    height: 48px;
  }
  [data-letter] {
    font-size: 18px;
  }
  [data-testid='creator-name'] {
    color: ${colors.accent};
    font-weight: 500;
    text-decoration: underline;
  }
  &[data-link]:hover [data-testid='creator-name'] {
    color: ${colors.brandViolet};
  }
`

export const DetailCreator = styled(CreatorBadge)`
  ${badgeDetailCss}
`

export const DetailCollection = styled(CollectionBadge)`
  ${badgeDetailCss}
`

export const Divider = styled.hr`
  border: 0;
  border-top: 1px solid #cfcdd4;
  margin: 24px 0 0;
  width: 100%;

  ${media.maxWidth('lg')} {
    order: 4;
    margin-top: 20px;
  }
`

export const PriceBlock = styled.div`
  margin-top: 16px;

  ${media.maxWidth('lg')} {
    order: 5;
    margin-top: 16px;
  }
`

export const PriceRow = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 16px;
  width: 100%;
`

export const PriceCol = styled.div`
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
`

export const StockCol = styled.div`
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  text-align: right;
`

// data-out = "OUT OF STOCK" beside a not-for-sale price.
export const StockValue = styled.div`
  font-size: 18px;
  font-weight: 500;
  line-height: 1;
  color: ${colors.text2};

  &[data-out] {
    font-size: 14px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.02em;
    color: ${colors.muted1};
  }
`

export const PriceLabel = styled.div`
  font-size: 14px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0;
  color: ${colors.muted1};
`

// Base price row. `data-variant`: none (unavailable) / sale (flash sale) — market carries the "≈" approx.
export const Price = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 700;
  color: ${colors.text};

  /* Not for sale: "Not for Sale" + an info tooltip, 14px semibold, no PRICE label. */
  &[data-variant='none'] {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 14px;
    font-weight: 600;
    color: ${colors.text};
  }
  &[data-variant='sale'] {
    flex-wrap: wrap;
    gap: 10px 14px;
    color: ${colors.dclRed};
  }
`

// The current-price group inside a sale row (emphasized, red).
export const PriceInner = styled.span`
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 700;
  color: ${colors.dclRed};
`

export const PriceValue = styled.span`
  font-size: 30px;
  line-height: 1;
`

export const PriceInfo = styled.span`
  display: inline-flex;
  color: ${colors.muted2};
  cursor: help;

  &:focus-visible {
    outline: 2px solid ${colors.accent};
    outline-offset: 2px;
    border-radius: ${radius.chip};
  }
`

export const Approx = styled.span`
  font-size: 24px;
  font-weight: 700;
  color: ${colors.text};
  margin-right: -2px;
`

export const MarketNote = styled.div`
  font-size: 13px;
  margin-top: 6px;
`

export const PriceWas = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: ${colors.muted};
  text-decoration: line-through;
  font-weight: 600;
  font-size: 20px;
`

export const SaleBadge = styled.span`
  display: inline-flex;
  align-items: center;
  background: ${colors.dclRed};
  color: #fff;
  font-weight: 800;
  font-size: 13px;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  border-radius: 6px;
  padding: 4px 10px;
`

export const Countdown = styled(SaleCountdown)`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: ${colors.rarityBg};
  color: ${colors.accent};
  font-size: 13px;
  font-weight: 700;
  border-radius: 6px;
  padding: 4px 10px;
  white-space: nowrap;
`

// Action block. `data-buttons` → the sticky mobile bar; `data-dual` → wide Buy-now + compact cart square.
export const Ctas = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 20px;

  ${media.maxWidth('lg')} {
    order: 6;

    &[data-buttons] {
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 40;
      margin-top: 0;
      padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
      background: ${colors.softWhite};
      box-shadow: 0 -4px 16px rgba(22, 21, 24, 0.12);
    }
    &[data-dual] {
      flex-direction: row;
      align-items: stretch;
      gap: 12px;
    }
  }
`

// PDP Buy-now CTA: full-width, taller, its own type scale. `&&` so font-size/letter-spacing win over
// the purple variant's data-variant rules. In the mobile dual bar it flexes beside the cart square.
export const DetailCta = styled(Button)`
  && {
    width: 100%;
    height: 48px;
    font-size: 15px;
    font-weight: 600;
    letter-spacing: 0.46px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }

  ${media.maxWidth('lg')} {
    [data-dual] && {
      flex: 1 1 auto;
      width: auto;
    }
  }
`

// Price shown inside the Buy-now button: hidden except in the mobile dual bar.
export const CtaPrice = styled.span`
  display: none;
  align-items: center;
  gap: 6px;

  ${media.maxWidth('lg')} {
    [data-dual] & {
      display: inline-flex;
    }
  }
`

export const AddCart = styled.button`
  width: 100%;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: ${colors.blackBtn};
  color: ${colors.softWhite};
  border: 0;
  border-radius: 16px;
  font-weight: 600;
  font-size: 15px;
  text-transform: uppercase;
  letter-spacing: 0.46px;
  cursor: pointer;
  transition: filter 0.15s ease;

  &:hover:not(:disabled) {
    filter: brightness(1.35);
  }
  &:disabled {
    opacity: 0.55;
    cursor: default;
  }

  ${media.maxWidth('lg')} {
    [data-dual] & {
      flex: 0 0 auto;
      width: 56px;
      padding: 0;
    }
    [data-dual] & .ico {
      margin: 0;
    }
  }
`

export const AddCartLabel = styled.span`
  ${media.maxWidth('lg')} {
    [data-dual] & {
      display: none;
    }
  }
`

export const Status = styled.p`
  margin: 0;
  font-size: 13px;

  ${media.maxWidth('lg')} {
    order: 7;
  }
`

// "This is your item" note shown instead of the buy CTAs — a bordered card, not bare text.
export const OwnNote = styled.p`
  margin: 0;
  font-size: 14px;
  padding: 16px;
  border: 1px solid ${colors.line};
  border-radius: ${radius.card};
  background: #fff;
  color: ${colors.muted};

  & a {
    color: ${colors.accent};
    font-weight: 600;
  }
`

export const NotFound = styled.div`
  max-width: 1721px;
  margin: 0 auto;
  min-height: 46vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 14px;
`

export const NotFoundCta = styled(Button)`
  margin-top: 6px;
`

export const NotFoundIco = styled(Icon)`
  opacity: 0.4;
`

export const NotFoundTitle = styled.h1`
  font-size: 22px;
`

export const InfoSkel = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`

export const SkelTitle = styled.span`
  height: 34px;
  width: 70%;
  border-radius: 8px;
`

export const SkelChips = styled.div`
  display: flex;
  gap: 8px;
`

export const SkelChip = styled.span`
  height: 24px;
  width: 88px;
  border-radius: 6px;
`

export const SkelLine = styled.span`
  height: 14px;
  width: 100%;
  border-radius: 6px;

  &[data-short] {
    width: 55%;
  }
`

export const SkelPrice = styled.span`
  height: 30px;
  width: 40%;
  border-radius: 8px;
`

export const SkelBtn = styled.span`
  height: 48px;
  width: 100%;
  border-radius: 8px;
  margin-top: 8px;
`

// The credits mark beside a price. Matches the price number (near-black) per the Figma credits mark,
// not the violet accent. data-was is the smaller, muted mark on a struck-through compare-at price.
export const Diamond = styled(CurrencyIcon)`
  width: 30px;
  height: 30px;
  color: ${colors.text};

  &[data-was] {
    width: 20px;
    height: 20px;
    color: ${colors.muted};
  }
`

// Smaller mark inside the mobile dual CTA's price.
export const CtaDiamond = styled(CurrencyIcon)`
  width: 20px;
  height: 20px;
`
