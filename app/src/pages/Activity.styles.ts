import styled from '@emotion/styled'
import { keyframes } from '@emotion/react'
import { theme } from '~/styles/theme'
import { Button } from '~/components/Button'

// Activity — a chronological feed of the signed-in user's shop actions (purchases + secondary sales),
// with type filters. Purchases render as ORDER cards (one card per checkout: header with date, status,
// total in credits + its line items); sales render as a matching card (date, "Sold" pill, +amount +
// the sold item). Styled to match the shop's rounded white cards, hairline borders, and violet accent;
// borrows the AssetCard/list vocabulary already used across the app.

const shimmer = keyframes`
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
`

// Reserve a screenful so the loading skeletons, the empty state and a short feed all occupy roughly
// the same height — the sticky footer stays put across loading → loaded and page → page.
export const Section = styled.section`
  width: 100%;
  min-width: 0;
  min-height: 60vh;
  /* Centre the whole column — heading, tabs and cards as ONE block — so the feed isn't parked against
     the left edge of a wide page. Centring only the list would leave the heading orphaned from it.

     ONE width for every view. The migration tool needs 1003px (its row is a thumbnail, a name and a
     144px price field; narrower, the price field drops to its own line on a desktop), and the feed used
     to sit at 760px — so switching chips resized the heading and the whole column under it, which reads
     as the page reloading rather than as a filter changing. */
  max-width: 1003px;
  margin-inline: auto;
`

export const Head = styled.div`
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 20px;
`

export const Title = styled.h1`
  font-family: ${theme.font.sans};
  margin: 0;
  color: ${theme.colors.softWhite};
`

export const Count = styled.span`
  color: ${theme.colors.gray4};
  font-size: 14px;
`

// Type filters (All / Purchases / Sales). Segmented pill row; the active tab is selected via
// `data-active` so no style-only prop reaches the DOM.
export const Tabs = styled.div`
  display: flex;
  gap: 8px;
  margin-bottom: 20px;
  flex-wrap: wrap;
`

// The SELECTED tab is the white pill and the unselected ones are the purple fill — the row reads as
// "the white one is where you are" against the purple page, which is the way round the design has it.
export const Tab = styled.button`
  appearance: none;
  /* Figma draws the row as a 0.5px Gray 4 hairline, a shade darker and half the weight of the card
     border this used, and sets the label a point smaller with the tracking the shop's other 13px
     pills carry. */
  border: 0.5px solid ${theme.colors.accent};
  background: ${theme.colors.accent};
  color: ${theme.colors.white};
  font-family: ${theme.font.sans};
  font-size: 13px;
  font-weight: 600;
  line-height: 24px;
  letter-spacing: 0.46px;
  /* The design gives the pill a flat 40px and no vertical padding, centring the 24px line box inside
     it — so the height is the 40 it draws rather than the sum of a line box, padding and a border. */
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 16px;
  min-height: 40px;
  border-radius: ${theme.radius.pill};
  cursor: pointer;
  transition:
    background 0.15s,
    border-color 0.15s,
    color 0.15s;

  &:hover {
    background: ${theme.colors.accentHover};
    border-color: ${theme.colors.accentHover};
  }
  &:focus-visible {
    outline: 2px solid ${theme.colors.white};
    outline-offset: 2px;
  }
  &[data-active='true'] {
    background: ${theme.colors.white};
    border-color: ${theme.colors.gray4};
    color: ${theme.colors.text};
  }
  &[data-active='true']:hover {
    background: ${theme.colors.media};
    border-color: ${theme.colors.gray4};
  }
`

// The migration chip. Figma gives it the filter chips' own hairline and fill rather than a colour of
// its own — it is drawn as a fourth chip in the row, and the violet count is the only thing marking it
// out — so the only thing this adds to the pill is the corner the count hangs off.
export const MigrateTab = styled(Tab)`
  position: relative;

  /* Violet-on-violet while the chip is UNSELECTED (that is the purple state now), so the badge inverts
     there. Reached by test id rather than by interpolating the styled def, which throws under vitest
     (see CLAUDE.md). */
  &:not([data-active='true']) [data-testid='activity-migrate-count'] {
    background: ${theme.colors.white};
    color: ${theme.colors.accent};
    /* See MigrateBadge: a white ring would vanish into the page here, since the disc itself is white. */
    box-shadow: 0 0 0 2px ${theme.colors.accent};
  }
`

// How many listings are still to move. Same 20px violet disc the tool uses over its own list, so the
// chip and the panel it opens agree on what a count looks like.
//
// Figma hangs the disc OVER the chip's top-right corner rather than seating it inside the pill, so it
// is out of flow: the chip is sized by its label alone, and the disc overhangs 2.5px to the right and
// 5.5px above. Nothing between here and the page scroller clips, so the overhang is safe.
export const MigrateBadge = styled.span`
  position: absolute;
  /* Offsets run from the chip's PADDING box, so they carry the 1px its hairline occupies in layout on
     top of the 5.5 / 2.5 the design measures from the pill's outer edge. */
  top: -6.5px;
  right: -3.5px;
  display: grid;
  place-items: center;
  /* The chip's tracking would otherwise widen the disc off its 20px. */
  letter-spacing: normal;
  /* Figma only ever draws a single digit, as a fixed 20px disc. The padding is what lets a two- or
     three-figure count grow leftwards out of the corner instead of spilling out of the circle. */
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: ${theme.radius.pill};
  background: ${theme.colors.brandViolet};
  /**
   * A ring, whose colour has to FOLLOW THE DISC rather than the page.
   *
   * The disc hangs off the corner: part of it sits on the chip, part on the page. Unselected it is violet
   * on white, so it already reads and the white ring only separates it from the chip's grey hairline.
   * Selected, the chip inverts it to white on violet — and a white disc against the white page has no edge
   * at all along the half that overhangs, which is the state where the circle looked unfinished. That case
   * needs the ring in the chip's accent instead (below), so the disc keeps a hard edge on both surfaces.
   *
   * box-shadow rather than a border: a border would grow the 20px disc the design fixes, while a spread
   * shadow draws outside the box.
   */
  box-shadow: 0 0 0 2px ${theme.colors.white};
  font-weight: 600;
  font-size: 12px;
  line-height: 1.6;
  color: ${theme.colors.white};
`

// Keeps the tool's own skeletons from jumping the page while its chunk loads.
export const PanelFallback = styled.div`
  min-height: 60vh;
`

export const List = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`

// One checkout.
export const Card = styled.div`
  background: ${theme.colors.white};
  border: 1px solid ${theme.colors.line};
  border-radius: 16px;
  overflow: hidden;
`

export const CardHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 18px;
  background: ${theme.colors.softWhite};
  border-bottom: 1px solid ${theme.colors.line};

  ${theme.media.maxWidth('mobile')} {
    flex-wrap: wrap;
  }
`

export const HeadLeft = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
`

export const DateText = styled.span`
  font-weight: 700;
  color: ${theme.colors.text};
`

export const SubCount = styled.span`
  font-size: 13px;
  color: ${theme.colors.muted};
`

export const HeadRight = styled.div`
  display: flex;
  align-items: center;
  gap: 14px;
  /* Pin to the right regardless of how many elements sit on the left (the credit-purchase card adds a
     leading thumbnail, giving the head three children instead of two). */
  margin-left: auto;
`

// Leading product thumbnail for a credit-pack purchase — the credits mark itself (the "product" bought),
// mirroring how item purchases show the NFT image.
export const CreditThumb = styled.div`
  flex: 0 0 auto;
  width: 52px;
  height: 52px;
  border-radius: 10px;
  background: ${theme.colors.media};
  display: flex;
  align-items: center;
  justify-content: center;

  img {
    width: 30px;
    height: 30px;
    display: block;
  }
`

// Status pill. `data-status` selects the palette so no style-only prop reaches the DOM.
export const Pill = styled.span`
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  padding: 4px 10px;
  border-radius: ${theme.radius.pill};
  white-space: nowrap;

  &[data-status='SETTLED'] {
    background: rgba(30, 166, 114, 0.14);
    color: ${theme.colors.okStrong};
  }
  &[data-status='PENDING'] {
    background: rgba(245, 166, 35, 0.16);
    color: #b5790a;
  }
  &[data-status='SOLD'] {
    background: rgba(103, 58, 183, 0.14);
    color: ${theme.colors.accent};
  }
  &[data-status='FAILED'] {
    background: rgba(214, 61, 61, 0.14);
    color: #b02a2a;
  }
  /* Nobody paid and nobody is owed anything — deliberately the quietest of the four. Reusing PENDING's
     amber here is what made an abandoned checkout look like money on its way. */
  &[data-status='UNFINISHED'] {
    background: ${theme.colors.line};
    color: ${theme.colors.muted};
  }
`

// Picks a checkout back up where the buyer left it. Sits beside the pill rather than under the card:
// it belongs to the row's status, and this is the only credit row that carries an action at all.
export const ResumeButton = styled.button`
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  padding: 4px 10px;
  border-radius: ${theme.radius.pill};
  white-space: nowrap;
  border: 1px solid ${theme.colors.accent};
  background: transparent;
  color: ${theme.colors.accent};
  cursor: pointer;
  transition: background 0.15s ease;

  &:hover:not(:disabled) {
    background: rgba(103, 58, 183, 0.08);
  }
  &:disabled {
    opacity: 0.6;
    cursor: default;
  }
`

export const Total = styled.div`
  display: flex;
  align-items: center;
  gap: 5px;
  font-weight: 800;
  color: ${theme.colors.text};
  white-space: nowrap;

  .ccy-mark {
    width: 16px;
    height: 16px;
  }

  // Money received (a sale) reads as income in the shop's success green.
  &[data-kind='income'] {
    color: ${theme.colors.okStrong};
  }
`

// The Polygon MANA symbol next to a sale's settlement amount (sales pay MANA, not credits). This is the
// exact icon the marketplace uses for MATIC MANA (decentraland-ui <Mana network="MATIC">), rendered as an
// <img> with a "Polygon MANA" tooltip to match the marketplace.
export const ManaSymbol = styled.img`
  width: 16px;
  height: 16px;
  vertical-align: -0.15em;
`

// "Polygon MANA" tooltip trigger, mirroring the marketplace's Mana popup. The bubble itself is portaled
// to <body> (see ManaTipBubble) because the card is overflow:hidden — a CSS bubble here (any z-index)
// would be clipped at the card edges. `cursor: pointer` signals the hover affordance.
export const ManaTip = styled.span`
  display: inline-flex;
  align-items: center;
  cursor: pointer;
`

// The floating tooltip bubble. Rendered via a portal to <body> and positioned with fixed coords, so it's
// never clipped by the card's overflow. Non-interactive.
export const ManaTipBubble = styled.span`
  position: fixed;
  transform: translateX(-50%);
  padding: 6px 8px;
  border-radius: 6px;
  background: #16141a;
  color: ${theme.colors.white};
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
  pointer-events: none;
  z-index: 9999;
`

export const Lines = styled.div`
  display: flex;
  flex-direction: column;
`

// A line item. Rendered as a router <Link> when the item detail resolves, else a plain <div>.
export const Line = styled.div`
  display: grid;
  grid-template-columns: 52px 1fr auto;
  align-items: center;
  gap: 14px;
  padding: 12px 18px;
  text-decoration: none;
  color: inherit;

  & + & {
    border-top: 1px solid ${theme.colors.line};
  }

  &[data-link='true'] {
    transition: background 0.15s;
  }
  &[data-link='true']:hover {
    background: ${theme.colors.media};
  }
  &[data-link='true']:focus-visible {
    outline: 2px solid ${theme.colors.accent};
    outline-offset: -2px;
  }
`

export const Thumb = styled.div`
  width: 52px;
  height: 52px;
  border-radius: 10px;
  background: ${theme.colors.media};
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${theme.colors.muted2};

  img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
`

export const ThumbSkeleton = styled.div`
  width: 52px;
  height: 52px;
  border-radius: 10px;
  background: linear-gradient(100deg, ${theme.colors.media} 30%, ${theme.colors.panel} 50%, ${theme.colors.media} 70%);
  background-size: 200% 100%;
  animation: ${shimmer} 1.3s infinite linear;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`

export const LineInfo = styled.div`
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
`

export const LineName = styled.span`
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`

export const LineNamePlaceholder = styled.span`
  display: inline-block;
  width: 140px;
  max-width: 60%;
  height: 12px;
  border-radius: 6px;
  background: linear-gradient(100deg, ${theme.colors.media} 30%, ${theme.colors.panel} 50%, ${theme.colors.media} 70%);
  background-size: 200% 100%;
  animation: ${shimmer} 1.3s infinite linear;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`

export const LineMeta = styled.span`
  font-size: 13px;
  color: ${theme.colors.muted};
`

export const LinePrice = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  font-weight: 700;
  color: ${theme.colors.text};
  white-space: nowrap;

  .ccy-mark {
    width: 14px;
    height: 14px;
  }
`

// Skeleton order card while the first page loads.
export const CardSkeleton = styled.div`
  height: 132px;
  border-radius: 16px;
  border: 1px solid transparent;
  background: linear-gradient(100deg, ${theme.colors.media} 30%, ${theme.colors.panel} 50%, ${theme.colors.media} 70%);
  background-size: 200% 100%;
  animation: ${shimmer} 1.3s infinite linear;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`

export const Empty = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  text-align: center;
  padding: 90px 20px;
  min-height: 50vh;
  color: ${theme.colors.softWhite};
`

export const EmptyTitle = styled.p`
  font-size: 22px;
  font-weight: 700;
  margin: 6px 0 0;
`

// The line under the title. Not the global `.muted` utility: that is the light theme's grey and it
// vanishes on the purple field — this stays in the block's own white.
export const EmptyBody = styled.p`
  margin: 0;
  color: ${theme.colors.softWhite};
`

export const EmptyCta = styled(Button)`
  margin-top: 12px;
`
