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

const { colors, radius, media, font } = theme

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
    color: ${colors.white};
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

  /* Bottom-LEFT: the emote controls and the preview note both own the bottom centre, and the mobile
     wearable/avatar toggle owns the bottom right, so this is the one free corner on every route. */
  & > [data-play-showcase] {
    position: absolute;
    bottom: 16px;
    left: 16px;
    z-index: 2;
    width: auto;
    height: auto;
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
      background: ${colors.white};
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

// "Play showcase" over the preview, in the same translucent-pill language as the preview's own controls
// (see [data-preview-toggle] / [data-preview-controls] above) rather than as a page CTA — it belongs to the
// viewer, not to the purchase. Positioned by the Preview block, which owns every overlay's placement.
export const PlayShowcase = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border: 1px solid ${colors.line};
  border-radius: ${radius.pill};
  background: rgba(255, 255, 255, 0.94);
  backdrop-filter: blur(6px);
  box-shadow: 0 2px 10px rgba(22, 21, 24, 0.12);
  color: ${colors.text};
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.12s ease;

  &:hover {
    background: ${colors.white};
  }
  &:focus-visible {
    outline: 2px solid ${colors.accent};
    outline-offset: 2px;
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

  /* The blocked-VRM-export badge. Warning orange, tinted at 20% for the fill — the marketplace's own
     #ff7439 on #ff743933, kept identical so the same restriction reads the same in both places. It is the
     one chip in this row that reports a limitation rather than a feature, and it should not blend in. */
  &[data-variant='blocked'] {
    background: rgba(255, 116, 57, 0.2);
    color: #ff7439;
    cursor: help;
  }
  &[data-variant='blocked']:focus-visible {
    outline: 2px solid #ff7439;
    outline-offset: 2px;
  }
`

export const Section = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
`

// Always inside DescRow, which owns the spacing above it and the responsive order — its own margin here
// would stack on top of the row's, and its `order` no longer applies from inside a column.
export const Description = styled(Section)`
  gap: 11px;
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

/**
 * DESCRIPTION and UTILITY share a row, as the design pairs them (and as Meta pairs creator + collection).
 * The row carries the responsive `order` that Description used to own: nesting Description inside it took
 * that element out of the info column, so its own order no longer applied there.
 * Below lg the two stack — side by side they would each be ~150px wide, which is not a column of prose.
 */
/**
 * ONE column geometry for both label pairs — description/utility and creator/collection.
 *
 * They used to disagree: this row was two equal halves while Meta was `space-between` with shrink-to-fit
 * columns, so UTILITY landed at 50% while COLLECTION landed wherever its content happened to start, and the
 * four labels formed two ragged columns instead of two straight ones. A shared grid makes every left label
 * start at the same x and every right label start at the same x, whatever their contents.
 */
const infoRowCss = css`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
`

export const DescRow = styled.div`
  ${infoRowCss};
  /* Clears the chips above. The pair below sits at 32px, so this is the tighter of the two steps: the
     description belongs to the heading block it follows, the creator/collection pair is a new subject. */
  margin-top: 24px;

  ${media.maxWidth('lg')} {
    order: 3;
    grid-template-columns: 1fr;
    /* Stacked, the two blocks need real separation — as one column they would read as one paragraph. */
    gap: 20px;
    margin-top: 20px;
  }
`

// min-width: 0 so a long unbroken utility string wraps inside its column instead of widening the track and
// pushing the description out.
export const DescCol = styled.div`
  min-width: 0;
`

export const Meta = styled.div`
  ${infoRowCss};
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
  border-top: 1px solid ${colors.gray4};
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
  color: ${colors.white};
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
// Shared PDP CTA box — full-width, 48px tall, 16px radius, Inter 600 15/24 with 0.46px tracking,
// uppercase, 8px icon gap. `&&` so these win over the Button base + any data-variant rules.
const ctaBox = css`
  && {
    width: 100%;
    height: 48px;
    border-radius: 16px;
    padding: 0 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    font-size: 15px;
    font-weight: 600;
    line-height: 24px;
    letter-spacing: 0.46px;
    text-transform: uppercase;
  }
`

// Buy-now CTA: the Amethyst gradient. In the mobile sticky bar it sits beside the cart square (the
// data-dual parent), where it flexes to share the row.
export const DetailCta = styled(Button)`
  ${ctaBox};

  ${media.maxWidth('lg')} {
    [data-dual] && {
      flex: 1 1 auto;
      width: auto;
    }
  }
`

// Dark-solid CTA — the primary manage action (Put up for sale / Edit price) and any solid dark button.
// Overrides the Button base colours via `&&`.
export const DarkCta = styled(Button)`
  ${ctaBox};
  && {
    background: ${colors.blackBtn};
    color: ${colors.softWhite};
    border: 0;

    .ico {
      width: 20px;
      height: 20px;
    }
  }
  &&:hover:not(:disabled) {
    background: ${colors.blackBtn};
    filter: brightness(1.35);
  }
`

// Dark-outline CTA — the secondary manage action (Transfer / Remove from sale).
export const OutlineCta = styled(Button)`
  ${ctaBox};
  && {
    background: transparent;
    border: 2px solid ${colors.blackBtn};
    color: ${colors.text};
  }
  &&:hover:not(:disabled) {
    background: rgba(36, 33, 41, 0.06);
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
  transition: background 0.15s ease;

  /* Hover is the design's gray-0, not a brightness lift. */
  &:hover:not(:disabled) {
    background: ${colors.gray0};
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

// "You own N of this" note on the generic item page: the item page never manages a token, so this
// points owners to My Assets instead of showing Edit/Remove. Subtle, sits under the buy CTAs.
export const OwnNote = styled.p`
  margin: 12px 0 0;
  font-size: 13px;
  color: ${colors.muted};

  & a {
    color: ${colors.accent};
    font-weight: 600;
  }
`

// "Manage all your items in My Assets" helper, mirroring the own-note styling.
export const ManageNote = styled.p`
  margin: 4px 0 0;
  font-size: 13px;
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

/**
 * No gap of its own: every block below carries the SAME margin as its loaded counterpart (chips 12,
 * description row 24, meta 32, divider its own). A gap here would add to those and the placeholder would
 * describe a page with different rhythm than the one that replaces it — which is exactly how the two drifted
 * apart the last time this layout changed.
 */
export const InfoSkel = styled.div`
  display: flex;
  flex-direction: column;
`

// A label bar (DESCRIPTION / UTILITY / CREATOR / COLLECTION), matched to the 12px uppercase label. Blocks
// explicitly: these bars also sit inside plain block columns, where a span would collapse to zero size.
export const SkelLabel = styled.span`
  display: block;
  height: 15px;
  width: 84px;
  border-radius: 4px;
`

/**
 * Stands in for DescText, whose 14px copy sits on a 30px line box. Three bars on that same 30px pitch
 * (14 + 16 gap, plus the 8px half-leading top and bottom) make the block exactly as tall as a three-line
 * description, so Meta below it doesn't move when the copy arrives.
 */
export const SkelText = styled.div`
  display: flex;
  flex-direction: column;
  align-self: stretch;
  gap: 16px;
  padding: 8px 0;
`

// The creator/collection badge: the 40px avatar and the name beside it, in the 48px box the real badge
// occupies (its link's line box is taller than the avatar).
export const SkelBadge = styled.span`
  display: inline-flex;
  align-items: center;
  height: 48px;
  gap: 10px;
  background: none !important;

  &::before,
  &::after {
    content: '';
    display: block;
  }
  &::before {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: ${colors.media};
  }
  &::after {
    width: 96px;
    height: 14px;
    border-radius: 6px;
    background: ${colors.media};
  }
`

// The loaded heading row is 40px tall — the 40px favourite button sets it, not the 34px title — so the bar
// carries the 3px of slack on both sides that the button contributes. Without it the chips start 6px high.
export const SkelTitle = styled.span`
  height: 34px;
  width: 70%;
  margin: 3px 0;
  border-radius: 8px;
`

export const SkelChips = styled.div`
  display: flex;
  gap: 8px;
  /* Same as Chips above, so the row does not move when the real chips arrive. */
  margin-top: 12px;
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

// The price row sits 16px under the rule and occupies 43px; the bar itself is the height of the number, so
// the rest of that box is margin. Same idea for the CTA: 42px tall, 20px under the price.
export const SkelPrice = styled.span`
  display: block;
  height: 30px;
  width: 40%;
  margin: 16px 0 13px;
  border-radius: 8px;
`

export const SkelBtn = styled.span`
  display: block;
  height: 42px;
  width: 100%;
  border-radius: 8px;
  margin-top: 20px;
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

// Primary-sale banner: a lavender pill above the price telling the buyer they're buying a fresh mint
// straight from the creator. Only shown for a primary (mint) listing.
export const PrimarySaleBanner = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px;
  margin: 16px 0;
  border-radius: ${radius.btn};
  background: #f4e9ff;
`

export const FromCreator = styled.span`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  line-height: 14px;
  color: ${colors.text};
`

export const FromCreatorIco = styled(Icon)`
  width: 20px;
  height: 20px;
  color: ${colors.rarity};
`

export const BannerCheck = styled(Icon)`
  width: 24px;
  height: 24px;
  color: ${colors.rarity};
`

// Lowest-price + resellers link: a row below the CTAs. Left shows the cheapest resale price; right is an
// internal link that scrolls to the Resellers list. data-centered when there is no link beside it.
export const LowestPriceRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  margin-top: 16px;

  &[data-centered] {
    justify-content: center;
  }
`

export const Lowest = styled.span`
  display: flex;
  align-items: center;
  gap: 2px;
  font-size: 14px;
  font-weight: 600;
  color: ${colors.muted};

  & .ico {
    width: 20px;
    height: 20px;
    color: ${colors.muted};
  }
`

export const LowestValue = styled.span`
  font-size: 16px;
  font-weight: 700;
  padding-left: 2px;
`

export const ResellersLink = styled.button`
  border: 0;
  background: none;
  padding: 0;
  cursor: pointer;
  font-family: ${font.sans};
  font-size: 13px;
  font-weight: 600;
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
    border-radius: ${radius.chip};
  }
`

// Sold-out price block: the exhausted primary's original price (struck) with a "SOLD OUT" tag, above the
// cheapest resale price + how many copies are on the secondary market.
export const SoldOutPricing = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 100%;
  padding: 16px 0;
`

// data-variant='original' is the struck-through muted row; 'resale' is the emphasised one. The children
// below read the variant off this row rather than carrying their own modifier.
export const SoRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;

  &[data-variant='original'] {
    color: ${colors.muted2};
  }
`

export const SoLabel = styled.span`
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 14px;
  font-weight: 600;

  [data-variant='original'] & {
    color: ${colors.muted2};
  }
  [data-variant='resale'] & {
    color: ${colors.text};
  }
`

export const SoPrice = styled.span`
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 0 2px;

  [data-variant='original'] & .ico {
    width: 20px;
    height: 20px;
    color: ${colors.muted2};
  }
  [data-variant='resale'] & .ico {
    width: 24px;
    height: 24px;
    color: ${colors.rarity};
  }
`

export const SoValue = styled.span`
  [data-variant='original'] & {
    font-size: 16px;
    font-weight: 700;
    text-decoration: line-through;
  }
  [data-variant='resale'] & {
    font-size: 25px;
    font-weight: 700;
    color: ${colors.text};
  }
`

export const SoTag = styled.span`
  font-size: 14px;
  font-weight: 600;

  [data-variant='original'] & {
    color: ${colors.muted2};
  }
`

export const SoStock = styled.span`
  font-size: 14px;
  font-weight: 600;
  color: ${colors.text2};
`

export const SoInfo = styled.span`
  display: inline-flex;
  width: 12px;
  height: 12px;
  color: ${colors.muted2};
`

// Owner/creator management actions (replace the buy CTAs when the viewer owns or created this item).
// Stacked full-width so the primary + secondary actions read as a clear action column.
export const ManageActions = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
`

// The resellers trigger under the manage CTAs, centered on its own line.
export const ManageResellers = styled.div`
  display: flex;
  justify-content: center;
`

// Loading skeletons for the sale section (price + CTAs) and the creator/collection badges. They reuse the
// global `shimmer` keyframe and are reduced-motion-safe, sized to the final content so the sector already
// occupies its eventual height — no reflow when the data lands.
const skeletonFill = css`
  display: block;
  background: linear-gradient(100deg, #efeef2 30%, #e2e0e7 50%, #efeef2 70%);
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite linear;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`

export const SaleSkeleton = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  /* Reserve the divider→CTA rhythm so the block is the same height loading vs loaded. */
  padding-top: 4px;
`

export const SkPrice = styled.span`
  ${skeletonFill};
  width: 120px;
  height: 30px;
  border-radius: ${radius.btn};
  margin-bottom: 4px;
`

// Full-width CTA-button placeholder (matches the 48px dark/outline buttons).
export const SkCta = styled.span`
  ${skeletonFill};
  width: 100%;
  height: 48px;
  border-radius: 16px;
`

// Creator/collection badge placeholder: circular avatar + name bar (matches CreatorBadge's layout).
export const SkBadge = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`

export const SkAva = styled.span`
  ${skeletonFill};
  flex: none;
  width: 48px;
  height: 48px;
  border-radius: 50%;
`

export const SkName = styled.span`
  ${skeletonFill};
  width: 96px;
  height: 16px;
  border-radius: 6px;
`
