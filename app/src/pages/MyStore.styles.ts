import styled from '@emotion/styled'
import { Link } from 'react-router-dom'
import { Dropdown } from '~/components/Dropdown'
import { Icon } from '~/components/Icon'
import { theme } from '~/styles/theme'

// The seller's dashboard. White panels on the Shop's purple field, the same surface My Creations uses, so
// the two read as one place rather than two products.

export const Root = styled.div`
  display: flex;
  flex-direction: column;
  gap: 22px;
`

export const Masthead = styled.header`
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
  flex-wrap: wrap;
`

export const Eyebrow = styled.p`
  margin: 0 0 6px;
  font-family: ${theme.font.sans};
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(252, 252, 252, 0.62);
`

export const Title = styled.h1`
  margin: 0;
  font-family: ${theme.font.sans};
  font-size: 32px;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: ${theme.colors.softWhite};

  ${theme.media.maxWidth('mobile')} {
    font-size: 26px;
  }
`

export const Sub = styled.p`
  margin: 6px 0 0;
  font-family: ${theme.font.sans};
  font-size: 14px;
  color: rgba(252, 252, 252, 0.62);
`

export const Periods = styled.div`
  display: flex;
  gap: 4px;
  padding: 4px;
  border-radius: ${theme.radius.pill};
  background: rgba(0, 0, 0, 0.22);
`

export const Period = styled.button`
  border: 0;
  cursor: pointer;
  font-family: ${theme.font.sans};
  padding: 7px 15px;
  border-radius: ${theme.radius.pill};
  font-size: 13px;
  font-weight: 600;
  color: rgba(252, 252, 252, 0.62);
  background: transparent;
  transition:
    color 0.15s ease,
    background 0.15s ease;

  &:hover {
    color: ${theme.colors.softWhite};
  }
  &[aria-pressed='true'] {
    background: ${theme.colors.softWhite};
    color: ${theme.colors.text};
  }
  &:focus-visible {
    outline: 2px solid ${theme.colors.softWhite};
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`

export const Tiles = styled.section`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;

  ${theme.media.maxWidth('lg')} {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  ${theme.media.maxWidth('mobile')} {
    grid-template-columns: minmax(0, 1fr);
  }
`

export const Tile = styled.div`
  background: ${theme.colors.softWhite};
  color: ${theme.colors.text};
  border-radius: ${theme.radius.card};
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
`

export const TileKey = styled.span`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-family: ${theme.font.sans};
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: ${theme.colors.muted1};
`

export const TileMark = styled.span`
  font-size: 13px;
  line-height: 1;
  filter: saturate(0.9);
`

export const TileValue = styled.span`
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-family: ${theme.font.sans};
  font-size: 30px;
  font-weight: 700;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
`

export const TileUnit = styled.span`
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0;
  color: ${theme.colors.muted};
`

export const TileFoot = styled.span`
  font-family: ${theme.font.sans};
  font-size: 12px;
  color: ${theme.colors.muted};
`

/**
 * The seam on a figure the Shop can only approximate.
 *
 * Earnings is a sum over rows the feed returns a page at a time, so past the cap it covers part of the
 * window. A dashboard that cannot tell what it knows from what it estimates is worse than one with fewer
 * figures, so the estimate says so rather than passing as exact.
 */
export const Estimate = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: ${theme.colors.muted1};
  border: 1px dashed ${theme.colors.muted2};
  border-radius: ${theme.radius.chip};
  padding: 1px 5px;
`

export const Columns = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1.55fr) minmax(0, 1fr);
  gap: 14px;
  align-items: start;

  ${theme.media.maxWidth('lg')} {
    grid-template-columns: minmax(0, 1fr);
  }
`

export const Side = styled.div`
  display: flex;
  flex-direction: column;
  gap: 14px;
`

export const Panel = styled.section`
  background: ${theme.colors.softWhite};
  color: ${theme.colors.text};
  border-radius: ${theme.radius.card};
  overflow: hidden;
`

export const PanelBody = styled.div`
  padding: 0 18px 18px;
`

export const PanelHead = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 18px 12px;
`

export const PanelTitle = styled.h2`
  margin: 0;
  font-family: ${theme.font.sans};
  font-size: 15px;
  font-weight: 700;
  letter-spacing: -0.01em;
`

export const HeadRight = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`

/**
 * The shop's own dropdown, re-inked for a white panel.
 *
 * Its trigger is drawn for the purple field — a translucent black fill with near-white text — which on
 * this surface reads as a disabled control. Same shape, panel colours.
 */
export const Sort = styled(Dropdown)`
  button {
    gap: 10px;
    padding: 5px 6px 5px 11px;
    background: ${theme.colors.softWhite};
    border-color: ${theme.colors.line};
    color: ${theme.colors.text};
    text-transform: none;
    letter-spacing: 0;
  }
  button:hover {
    border-color: ${theme.colors.muted2};
    background: ${theme.colors.panel};
  }
  /* The chevron's colour is an inline style on the shared component (near-white, for the purple field),
     so a class cannot reach it — this is the one place that has to shout. */
  button .ico {
    color: ${theme.colors.accent} !important;
  }
`

export const PanelHint = styled.span`
  font-family: ${theme.font.sans};
  font-size: 12px;
  color: ${theme.colors.muted};
`

export const CollRow = styled.div`
  display: grid;
  grid-template-columns: 24px 40px minmax(0, 1fr) 76px 96px 116px;
  align-items: center;
  gap: 14px;
  padding: 14px 18px;
  border-top: 1px solid ${theme.colors.line};

  /* The last cell holds either a sale tag or a button; a fixed track keeps every row's columns aligned
     whichever it is, and the content sits at its end. */
  > *:last-child {
    justify-self: end;
  }

  ${theme.media.maxWidth('mobile')} {
    grid-template-columns: 24px 40px minmax(0, 1fr) auto;
    row-gap: 10px;
  }
`

/** The disclosure control. A button, not a decoration: it is what opens the per-item breakdown. */
export const Chevron = styled.button`
  position: relative;
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: ${theme.radius.btn};
  background: none;
  cursor: pointer;
  color: ${theme.colors.muted};

  &:hover {
    background: ${theme.colors.chip};
    color: ${theme.colors.text};
  }
  &:focus-visible {
    outline: 2px solid ${theme.colors.accent};
    outline-offset: 2px;
  }

  /* A finger needs more than the 24px the glyph occupies, and the row has that much clear space around it. */
  &::after {
    content: '';
    position: absolute;
    inset: -10px;
  }

  .ico {
    width: 16px;
    height: 16px;
    transition: transform 0.18s ease;
  }
  &[aria-expanded='true'] .ico {
    transform: rotate(180deg);
  }

  @media (prefers-reduced-motion: reduce) {
    .ico {
      transition: none;
    }
  }
`

export const Mosaic = styled.span`
  width: 40px;
  height: 40px;
  border-radius: ${theme.radius.btn};
  overflow: hidden;
  background: ${theme.colors.media};
`

export const CollName = styled.span`
  min-width: 0;

  a {
    display: block;
    color: inherit;
    text-decoration: none;
    font-family: ${theme.font.sans};
    font-size: 14px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  a:hover,
  a:focus-visible {
    text-decoration: underline;
  }
  span {
    font-family: ${theme.font.sans};
    font-size: 12px;
    color: ${theme.colors.muted};
  }
`

export const Num = styled.span`
  font-family: ${theme.font.sans};
  font-size: 15px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  text-align: right;

  small {
    display: block;
    font-size: 11px;
    font-weight: 500;
    color: ${theme.colors.muted};
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  ${theme.media.maxWidth('mobile')} {
    display: none;
  }
`

export const SparkCell = styled.span`
  ${theme.media.maxWidth('mobile')} {
    display: none;
  }
`

export const Spark = styled.svg`
  display: block;
  width: 96px;
  height: 30px;
`

export const Items = styled.div`
  border-top: 1px solid ${theme.colors.line};
  background: ${theme.colors.panel};
  padding: 4px 18px 10px 56px;

  ${theme.media.maxWidth('mobile')} {
    padding-left: 32px;
  }
`

/** What the collection itself did, at the head of its own breakdown. */
export const CollStats = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px 26px;
  padding: 12px 0 13px;
  border-bottom: 1px solid ${theme.colors.line};

  span {
    display: flex;
    align-items: baseline;
    gap: 6px;
    font-family: ${theme.font.sans};
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: ${theme.colors.muted};
  }
  b {
    font-size: 15px;
    font-weight: 700;
    letter-spacing: 0;
    text-transform: none;
    color: ${theme.colors.text};
    font-variant-numeric: tabular-nums;
  }
`

export const ItemRow = styled.div`
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr) 64px 84px 92px;
  align-items: center;
  gap: 12px;
  padding: 9px 0;

  > *:last-child {
    justify-self: end;
  }

  & + & {
    border-top: 1px solid ${theme.colors.line};
  }

  ${theme.media.maxWidth('mobile')} {
    grid-template-columns: 40px minmax(0, 1fr) auto;
  }
`

/** The item's own thumbnail over its rarity wash — the same treatment its card gets in the grid. */
export const ItemThumb = styled.span`
  display: block;
  width: 40px;
  height: 40px;
  border-radius: ${theme.radius.btn};
  overflow: hidden;
  background: ${theme.colors.media};

  img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
`

export const ItemCell = styled.span`
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
`

export const ItemMeta = styled.span`
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
`

/** The item's rarity, stated the way its card states it — same palette, same wording. */
export const RarityChip = styled.span`
  flex: none;
  display: inline-flex;
  align-items: center;
  height: 15px;
  padding: 0 6px;
  border-radius: 5px;
  font-family: ${theme.font.sans};
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: ${theme.colors.softWhite};
`

export const ItemName = styled(Link)`
  font-family: ${theme.font.sans};
  font-size: 13px;
  color: inherit;
  text-decoration: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  &:hover,
  &:focus-visible {
    text-decoration: underline;
  }
`

export const ItemNum = styled.span`
  font-family: ${theme.font.sans};
  font-size: 13px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  text-align: right;
  color: ${theme.colors.text};

  small {
    color: ${theme.colors.muted};
    font-weight: 500;
  }

  ${theme.media.maxWidth('mobile')} {
    display: none;
  }
`

/**
 * How much of an item's run is gone, at a glance.
 *
 * Deliberately not the offer bar from the item page: that one measures a discount's allowance, this one
 * measures the mint. Same visual family, different quantity — so it is drawn thinner and in the muted ink
 * rather than the sale red, which belongs to the discount.
 */
export const Run = styled.span`
  display: block;
  width: 84px;
  margin-right: 10px;
  height: 6px;
  border-radius: 100px;
  background: rgba(22, 21, 24, 0.1);
  overflow: hidden;

  i {
    display: block;
    height: 6px;
    border-radius: 100px;
    background: ${theme.colors.accent};
  }

  ${theme.media.maxWidth('mobile')} {
    display: none;
  }
`

export const ItemState = styled.span`
  font-family: ${theme.font.sans};
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  white-space: nowrap;
  color: ${theme.colors.muted};

  &[data-state='soldout'] {
    color: ${theme.colors.accent};
  }
  /* A listed item shows its price rather than a label, so it takes the ink prices take. */
  &[data-state='classic'],
  &[data-state='discounted'] {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    font-size: 12px;
    letter-spacing: 0;
    text-transform: none;
    color: ${theme.colors.text};
  }
`

export const StockCell = styled.span`
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 5px;
`

/** The label before a listed item's price, so the number is not a bare figure in a column of counts. */
export const OnSaleFor = styled.span`
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: ${theme.colors.muted};
  margin-right: 4px;
`

/** Copies that exist without a sale behind them — sent, not bought. */
export const Issued = styled.span`
  font-family: ${theme.font.sans};
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  white-space: nowrap;
  color: ${theme.colors.muted1};
`

/** Copies left against the whole run — always shown, because "9 left" of what is not an answer. */
export const Stock = styled.span`
  font-family: ${theme.font.sans};
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  white-space: nowrap;
  text-align: right;
  color: ${theme.colors.muted};
  font-variant-numeric: tabular-nums;

  b {
    color: ${theme.colors.text};
    font-weight: 700;
  }
  &[data-out='true'] {
    color: ${theme.colors.accent};
  }
`

export const AttnRow = styled.div`
  display: grid;
  grid-template-columns: 3px minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  padding: 13px 18px;
  border-top: 1px solid ${theme.colors.line};
`

export const Stripe = styled.span`
  align-self: stretch;
  border-radius: 2px;
  background: ${theme.colors.muted2};

  &[data-sev='act'] {
    background: ${theme.colors.dclRed};
  }
  &[data-sev='soon'] {
    background: ${theme.colors.flareAmber};
  }
`

/** The mark that carries a row's explanation, beside its title rather than under it. */
export const Info = styled.button`
  display: inline-grid;
  place-items: center;
  width: 16px;
  height: 16px;
  margin-left: 5px;
  padding: 0;
  border: 0;
  background: none;
  cursor: help;
  color: ${theme.colors.muted2};

  &:hover,
  &:focus-visible {
    color: ${theme.colors.muted};
  }
  .ico {
    width: 14px;
    height: 14px;
  }
`

export const AttnText = styled.span`
  b {
    display: flex;
    align-items: center;
    font-family: ${theme.font.sans};
    font-size: 13px;
    font-weight: 600;
  }
  span {
    display: block;
    margin-top: 2px;
    font-family: ${theme.font.sans};
    font-size: 12px;
    color: ${theme.colors.muted};
  }
`

/** The row's way out: where the creator goes to do something about it. */
export const AttnLink = styled(Link)`
  display: inline-block;
  margin-top: 4px;
  font-family: ${theme.font.sans};
  font-size: 12px;
  font-weight: 600;
  color: ${theme.colors.accent};
  text-decoration: none;

  &:hover,
  &:focus-visible {
    text-decoration: underline;
  }
`

export const AttnNum = styled.span`
  font-family: ${theme.font.sans};
  font-size: 18px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
`

export const FeedWrap = styled.div`
  overflow-x: auto;
`

export const Feed = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-family: ${theme.font.sans};
  font-size: 13px;
  min-width: 520px;

  thead th {
    text-align: left;
    padding: 0 18px 10px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: ${theme.colors.muted1};
    white-space: nowrap;
  }
  tbody td {
    padding: 12px 18px;
    border-top: 1px solid ${theme.colors.line};
    vertical-align: middle;
  }
  tbody tr:hover {
    background: ${theme.colors.panel};
  }
  td[data-money] {
    text-align: right;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  td[data-dim] {
    color: ${theme.colors.muted};
    font-variant-numeric: tabular-nums;
  }
`

export const SaleItem = styled.span`
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  color: inherit;
  text-decoration: none;

  span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  &:hover span,
  &:focus-visible span {
    text-decoration: underline;
  }
`

export const SaleThumb = styled.span`
  flex: none;
  display: block;
  width: 32px;
  height: 32px;
  border-radius: ${theme.radius.chip};
  overflow: hidden;
  background: ${theme.colors.media};

  img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
`

/** Who bought, as their profile: face and display name, opening their page in its own tab. */
export const Buyer = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: inherit;
  text-decoration: none;

  &:hover,
  &:focus-visible {
    text-decoration: underline;
  }
`

export const Face = styled.span`
  flex: none;
  display: block;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background-color: ${theme.colors.media};
  background-size: cover;
  background-position: center top;
`

export const Pager = styled.nav`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 12px 18px 16px;
  border-top: 1px solid ${theme.colors.line};
  font-variant-numeric: tabular-nums;
`

const pageControl = `
  min-width: 32px;
  height: 32px;
  padding: 0 10px;
  border: 1px solid ${theme.colors.line};
  border-radius: ${theme.radius.btn};
  background: ${theme.colors.softWhite};
  font-family: ${theme.font.sans};
  font-size: 12px;
  font-weight: 600;
  color: ${theme.colors.text};
  cursor: pointer;

  &:hover:not(:disabled) {
    border-color: ${theme.colors.accent};
    color: ${theme.colors.accent};
  }
  &:focus-visible {
    outline: 2px solid ${theme.colors.accent};
    outline-offset: 2px;
  }
  &:disabled {
    opacity: 0.4;
    cursor: default;
  }
`

export const PageBtn = styled.button`
  ${pageControl}
`

/** The page you are on wears the shop's purple; the rest are plain. */
export const PageNum = styled.button`
  ${pageControl}

  &[aria-current='page'] {
    background: ${theme.colors.accent};
    border-color: ${theme.colors.accent};
    color: ${theme.colors.softWhite};
    cursor: default;
  }
  &[aria-current='page']:hover {
    color: ${theme.colors.softWhite};
  }
`

export const PageGap = styled.span`
  padding: 0 2px;
  font-family: ${theme.font.sans};
  font-size: 12px;
  color: ${theme.colors.muted};
`

export const Kind = styled.span`
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  border-radius: ${theme.radius.chip};
  padding: 2px 7px;
  white-space: nowrap;
  color: ${theme.colors.muted1};
  background: ${theme.colors.media};

  &[data-kind='mint'] {
    color: ${theme.colors.accent};
    background: rgba(105, 31, 169, 0.1);
  }
`

export const ManaMark = styled.img`
  width: 1em;
  height: 1em;
  vertical-align: -0.125em;
  margin-right: 3px;
`

/** The development preview's own strip, on the purple field rather than on a white panel. */
export const Preview = styled.p`
  margin: 0;
  padding: 10px 14px;
  border: 1px dashed rgba(252, 252, 252, 0.32);
  border-radius: ${theme.radius.btn};
  font-family: ${theme.font.sans};
  font-size: 12px;
  color: rgba(252, 252, 252, 0.72);
  word-break: break-all;
`

export const More = styled.button`
  display: block;
  width: 100%;
  padding: 13px 18px;
  border: 0;
  border-top: 1px solid ${theme.colors.line};
  background: none;
  cursor: pointer;
  font-family: ${theme.font.sans};
  font-size: 13px;
  font-weight: 600;
  color: ${theme.colors.accent};

  &:hover {
    background: ${theme.colors.panel};
  }
  &:focus-visible {
    outline: 2px solid ${theme.colors.accent};
    outline-offset: -2px;
  }
`

/** A line of context under a panel's rows — why they do not add up, or what could not be read. */
export const Note = styled.p`
  margin: 0;
  padding: 12px 18px 16px;
  border-top: 1px solid ${theme.colors.line};
  font-family: ${theme.font.sans};
  font-size: 12px;
  color: ${theme.colors.muted};
`

/**
 * One bar of the loading state.
 *
 * The skeleton is built from the REAL containers — the same tiles, panels and rows the figures land in —
 * with these standing in for the text, so the layout cannot shift when the data arrives. `.skeleton` is
 * the shared shimmer from index.css.
 */
const shimmerFill = `
  background: linear-gradient(100deg, #ededed 30%, #f7f7f7 50%, #ededed 70%);
  background-size: 200% 100%;
  animation: shimmer 1.3s infinite linear;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`

// Light greys, not the shared `--skeleton-lo/hi`: those are translucent white for the purple field, and
// these bars sit inside white panels where they would be invisible.
export const Bar = styled.span`
  display: block;
  height: 12px;
  border-radius: 100px;
  ${shimmerFill}
`

export const Dot = styled.span`
  display: block;
  width: 40px;
  height: 40px;
  border-radius: ${theme.radius.btn};
  ${shimmerFill}
`

/** The table's header row while it loads, on the same grid as the rows below it. */
export const FeedHeadBone = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 0.7fr) 100px minmax(0, 0.5fr) 70px;
  align-items: center;
  gap: 12px;
  padding: 0 18px 10px;

  > *:last-child {
    justify-self: end;
  }
`

/** A row of the loading feed, on the table's own column rhythm. */
export const FeedBone = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 0.7fr) 100px minmax(0, 0.5fr) 70px;
  align-items: center;
  gap: 12px;
  height: 57px;
  padding: 0 18px;
  border-top: 1px solid ${theme.colors.line};

  > *:last-child {
    justify-self: end;
  }
`

export const Empty = styled.p`
  margin: 0;
  padding: 0 18px 18px;
  font-family: ${theme.font.sans};
  font-size: 13px;
  color: ${theme.colors.muted};
`

export const ChevronIcon = styled(Icon)`
  width: 16px;
  height: 16px;
`
