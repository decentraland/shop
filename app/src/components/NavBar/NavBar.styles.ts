import styled from '@emotion/styled'
import { NavLink } from 'react-router-dom'
import { theme } from '~/styles/theme'
import { CurrencyIcon } from '~/components/CurrencyIcon'
import { Icon } from '~/components/Icon'

const { colors, radius, gradients, media } = theme

const mobile = media.maxWidth('mobile')
// One row cannot hold the tab strip, a usable search field AND the balance/credits/cart cluster below
// ~900px: something has to be cut, and every candidate is a control someone needs. So from `lg` down the
// row wraps into the stacked layout mobile already used — search and tabs each get their own line — and
// only the ≤768 cosmetics (shorter navbar, smaller type) stay in the `mobile` blocks below. This is also
// the breakpoint where the browse sidebar becomes the Filters drawer, so the two shifts happen together.
const stacked = media.maxWidth('lg')

export const Subnav = styled.div`
  position: sticky;
  top: 92px;
  z-index: 40;
  display: flex;
  align-items: center;
  gap: 24px;
  height: 66px;
  /* 54px matches the ui2 Navbar's desktop side padding so the sub-nav aligns with the top nav. */
  padding: 0 54px;
  /* Dark-theme test: translucent deep purple (#401458, per the designer) over the page field, hairline
     white divider. 20% at rest, deepening to 80% once the page scrolls so the bar doesn't wash out over
     light content passing underneath — the same treatment the top nav carries. */
  background: rgba(64, 20, 88, 0.2);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.3);
  transition: background 0.25s ease;

  &[data-scrolled] {
    background: rgba(64, 20, 88, 0.8);
  }

  ${stacked} {
    height: auto;
    flex-wrap: wrap;
    /* Column gap tightened to 8px: at 320px the CTA + balance + favourites + cart leave only a few pixels of
       slack and three 12px gaps spend it, which is what wrapped the cart onto its own line. Rows keep 12px —
       the search and tab strips have their own full-width basis, so this only affects the top row. */
    gap: 12px 8px;
    padding: 12px 54px 0;
  }

  ${mobile} {
    top: 64px;
    padding: 12px 16px 0;
  }
`

// While the row is shared (above `lg`) the tab strip is its FLEXIBLE part. Its links are nowrap, so
// without min-width: 0 the strip's min-content width (~612px) is rigid: the sub-nav then squeezes the
// search field to nothing and, once even that runs out, pushes the whole page into horizontal overflow.
// The strip scrolls instead — the mask on its right edge is what tells you there is more to reach, since
// the scrollbar is hidden. Below `lg` the strip has its own full-width row and none of this applies.
// Holds the row's ONE auto margin, and it is on the tab strip rather than on anything to its right on
// purpose: everything after the tabs — the search field, the CTA, favourites, the cart — then travels
// together against the right edge, and it keeps doing that whether or not the search is rendered (it is
// hidden on My Items). Put on a member of that group instead, the alignment either breaks on the route
// without a search, or two auto margins split the slack and park the field mid-row.
export const Tabs = styled.nav`
  /**
   * WIDE VIEWPORTS: the strip does not shrink, so no tab label is cut.
   *
   * The search field beside it stopped growing (see Search) and now shrinks from its 496px design width.
   * That alone did not free the strip: flex shrinks EVERY shrinkable sibling in proportion, so the strip
   * gave up width too and clipped at 1440 — measured, and no amount of extra shrink on the field fixed it
   * (at shrink 6 the field only reached 422px and the strip still clipped). The strip has to refuse to
   * shrink for the field to absorb the squeeze.
   *
   * Only above 1280px. Measured: with the strip fixed, 1440 and 1280 both fit with the field above its
   * 240px floor, but from 1200 down the whole ROW stops fitting and the PAGE scrolls sideways — worse than
   * a clipped label, since the strip at least scrolls on purpose. Below this the strip yields again and
   * clips, which is the intended behaviour between the field's floor and the wrap at lg.
   *
   * 1280 rather than the xl token (1200): 1200 is inside the page-overflow range, so the token would
   * reintroduce the very thing this avoids.
   */
  @media (min-width: 1280px) {
    flex-shrink: 0;
  }

  margin-right: auto;
  display: flex;
  gap: 40px;
  height: 100%;
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }

  /* Between lg and xl the strip is always narrower than its content, so fade its right edge: the
     scrollbar is hidden and a label cut off mid-word just reads as a bug. Not applied above xl, where
     the strip is whole and a fade would be a hint to nowhere. */
  ${media.maxWidth('xl')} {
    mask-image: linear-gradient(to right, #000 calc(100% - 24px), transparent);
  }

  ${stacked} {
    mask-image: none;
  }

  & a {
    display: flex;
    align-items: center;
    height: 100%;
    white-space: nowrap;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    font-size: 15px;
    font-weight: 600;
    color: ${colors.muted2};
    border-bottom: 4px solid transparent;
  }
  & a:hover {
    color: ${colors.white};
  }
  /* Active tab: white label + orange underline (Figma dark theme). */
  & a.active {
    color: ${colors.white};
    border-bottom-color: #ff7439;
  }

  ${stacked} {
    order: 6;
    flex: 1 0 100%;
    height: auto;
  }

  ${mobile} {
    gap: 16px;

    & a {
      height: 44px;
      font-size: 12px;
      letter-spacing: 0.038em;
      border-bottom-width: 4px;
      padding: 8px 0 12px;
    }
  }
`

// position:relative is the offset parent for the SearchDropdown's absolutely-positioned panel.
export const Search = styled.div`
  position: relative;
  /* This field once carried the row's auto left margin, and that made the whole right-hand group's
     alignment depend on a sibling only some routes render — on My Items, where it is hidden, the CTA,
     favourites and cart collapsed back against the tab strip. The margin lives on Tabs now, so the field is
     simply the first member of the group rather than the thing holding it up. */
  /* Grows from a 240px basis but never past the design's 496px. The basis matters: a 496px basis is claimed
     up front and, once the row is tight, the strip beside it gives up label width instead — tabs clipped at
     1440. Capping the GROWTH instead is what lets the field reach its design width and still leave the rest
     of the slack to the tab strip's auto margin, so the field travels with the buttons on its right rather
     than stretching to meet them. 240px is the floor because below it the field is just a magnifier. */
  flex: 1 0 240px;
  max-width: 496px;
  display: flex;
  align-items: center;
  gap: 10px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid #c6bcd7;
  border-radius: ${radius.pill};
  padding: 0 16px;
  height: 40px;

  & input {
    border: 0;
    outline: 0;
    width: 100%;
    font-size: 15px;
    background: transparent;
    color: ${colors.white};
  }
  & input::placeholder {
    color: ${colors.gray4};
  }

  ${stacked} {
    order: 5;
    /* Own row here — full width, so neither the desktop basis nor its cap may hold it back. */
    flex: 1 0 100%;
    max-width: none;
  }

  ${mobile} {
    height: 40px;
    border-radius: 12px;
    padding: 0 12px;

    & input {
      font-size: 14px;
    }
  }
`

export const MobileDivider = styled.hr`
  display: none;
  ${stacked} {
    order: 5;
  }

  ${mobile} {
    display: block;
    flex: 1 0 100%;
    height: 0;
    margin: 0;
    border-color: transparent;
    border-top: 1px solid rgba(255, 255, 255, 0.3);
  }
`

export const SearchClear = styled.button`
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  flex: 0 0 auto;
  /* The UA button padding (1px 6px) leaves an 8px content box — narrower than the 14px glyph, which
     then start-aligns instead of centering and sits 3px right of the round hover fill. */
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.14);
  color: ${colors.muted2};
  font-size: 15px;
  line-height: 1;
  cursor: pointer;

  &:hover {
    background: rgba(255, 255, 255, 0.26);
    color: ${colors.white};
  }
`

// No auto margin here: Tabs carries the row's single one, which is what keeps this group — and the search
// field before it — against the right edge on every route.
export const Credits = styled(NavLink)`
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 40px;
  padding: 0 16px;
  border-radius: ${radius.btn};
  /* The orange "BUY Button" gradient — the same fill the promo CTAs carry (Figma 738:53266). */
  background: ${gradients.buyBtn};
  color: ${colors.softWhite};
  font-weight: 600;
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.46px;
  white-space: nowrap;
  transition: filter 0.15s ease;

  /* Hover ring (Figma): a gradient stroke OUTSIDE the button with a gap in between (the page shows
     through the gap). Drawn as a masked gradient ring — a plain outline can't take a gradient. */
  &::before {
    content: '';
    position: absolute;
    inset: -6px;
    border-radius: calc(${radius.btn} + 6px);
    padding: 2px;
    background: ${gradients.buyBtn};
    -webkit-mask:
      linear-gradient(#fff 0 0) content-box,
      linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor;
    mask:
      linear-gradient(#fff 0 0) content-box,
      linear-gradient(#fff 0 0);
    mask-composite: exclude;
    opacity: 0;
    transition: opacity 0.15s ease;
    pointer-events: none;
  }

  &:hover {
    filter: brightness(1.08);
  }
  &:hover::before {
    opacity: 1;
  }
  &:active {
    filter: brightness(0.95);
  }

  ${stacked} {
    order: 1;
  }
`

export const CreditsIco = styled(CurrencyIcon)`
  width: 20px;
  height: 20px;
`

// Favorites heart. `.active` is applied by NavLink when on /my-favorites.
export const Fav = styled(NavLink)`
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: ${radius.btn};
  color: #ecebed;
  transition:
    background 0.12s ease,
    color 0.12s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.12);
  }

  ${stacked} {
    order: 3;
    /* The stacked row's ONE auto margin, and it is here rather than on the CTA to its left for the same
       reason Tabs carries the wide row's: the CTA is not always rendered (it is gone inside the iOS web
       view, which may not sell credits), and an auto margin on it took the heart and the cart's right
       alignment with it — they collapsed against the left edge. On the first member of the right-hand
       group instead, the group travels to the right edge whether or not the CTA is there. Still exactly one
       auto margin in both cases: with the CTA present the slack all lands here, pinning it left and this
       group right, which is what it already looked like. */
    margin-left: auto;
  }
`

// Stacks the outline heart under the solid one so the fill can flood the outline in place.
export const FavIcons = styled.span`
  position: relative;
  width: 28px;
  height: 28px;
`

// The outline stroke — fades out as the solid heart arrives (delayed to land as the fill reaches full),
// so the active (on /my-favorites) state is a clean solid glyph, not a fill inside a ring.
export const FavOutline = styled(Icon)`
  transition: opacity 160ms ease;

  .active & {
    opacity: 0;
    transition: opacity 140ms ease 160ms;
  }

  @media (prefers-reduced-motion: reduce) {
    &,
    .active & {
      transition: none;
    }
  }
`

// The solid heart grows from the centre when the favourites route is active: springy pop in,
// quick scale-out on leave.
export const FavFill = styled(Icon)`
  position: absolute;
  inset: 0;
  color: ${colors.white};
  transform: scale(0);
  transform-origin: center;
  transition: transform 200ms ease-in;
  pointer-events: none;

  .active & {
    transform: scale(1);
    transition: transform 280ms cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  @media (prefers-reduced-motion: reduce) {
    &,
    .active & {
      transition: none;
    }
  }
`

// position:relative anchors CartPopover's absolutely-positioned `.cart-pop`.
export const CartWrap = styled.div`
  position: relative;

  ${stacked} {
    order: 4;
  }
`

export const Cart = styled.button`
  position: relative;
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  background: transparent;
  border-radius: ${radius.btn};
  color: #ecebed;
  border: 0;
  padding: 0;
  font: inherit;
  cursor: pointer;
  transition: background 0.12s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.12);
  }
`

// Filled while the cart holds something: the solid cart grows from the centre when the first item
// lands and stays filled until the cart empties, so the icon reads as "cart has stuff". Mirrors the
// favourites heart's persistent fill.
export const CartIcons = styled.span`
  position: relative;
  width: 28px;
  height: 28px;
`

export const CartOutline = styled(Icon)`
  transition: opacity 160ms ease;

  [data-filled] & {
    opacity: 0;
    transition: opacity 140ms ease 160ms;
  }

  @media (prefers-reduced-motion: reduce) {
    &,
    [data-filled] & {
      transition: none;
    }
  }
`

export const CartFill = styled(Icon)`
  position: absolute;
  inset: 0;
  color: ${colors.white};
  transform: scale(0);
  transform-origin: center;
  transition: transform 200ms ease-in;
  pointer-events: none;

  [data-filled] & {
    transform: scale(1);
    transition: transform 280ms cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  @media (prefers-reduced-motion: reduce) {
    &,
    [data-filled] & {
      transition: none;
    }
  }
`

export const CartBadge = styled.span`
  position: absolute;
  top: -4px;
  right: -4px;
  /* Brand/Ruby, per the Figma sub-nav (2090:385780) — was the brand violet. */
  background: ${colors.dclRed};
  color: ${colors.white};
  font-size: 12px;
  font-weight: 600;
  border-radius: 999px;
  min-width: 20px;
  height: 20px;
  display: grid;
  place-items: center;
  padding: 0 5px;
`

// The cluster the shop hands to ui2's Navbar as its `notificationSlot` — the only place a consumer can
// render into that row. It carries the network selector as well as the bell, so it needs to lay two items
// out rather than pass one through: ui2 wraps the slot in a plain block div, which would leave them
// touching.
//
// `flex`, NOT `inline-flex`. An inline-level box hands its vertical position to baseline arithmetic
// instead of the flex row, which drifts with the font metrics at each zoom level — the bell has been
// knocked off the row's centre line that exact way before (see the alignment sweep in
// e2e/notifications.e2e.ts). Block-level, this box is the slot div's only child, centres its own children,
// and is itself centred by the navbar row, so the bell's glyph stays on the shared centre line whether or
// not the selector is rendered.
export const NavSlot = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`
