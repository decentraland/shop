import styled from '@emotion/styled'
import { Icon } from '~/components/Icon'
import { theme } from '~/styles/theme'

const { colors, media, radius } = theme

// The main-area toolbar for the unified browse grid (Figma nodes 1256-293193 desktop / 1304-310186
// mobile). Result count on the left, applied-filter chips beside it, Sort By (+ a mobile-only Filters
// pill) on the right. Flex-wrap + `order` reflows the chips onto their own line below on mobile.
export const Toolbar = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  margin-bottom: 20px;
`

export const Count = styled.span`
  order: 1;
  color: #ecebed;
  font-weight: 400;
  font-size: 14px;
  line-height: 1.43;
  white-space: nowrap;

  ${media.maxWidth('lg')} {
    /* Below the controls on its own line: the search field and the two pills share the first row. */
    order: 3;
    flex-basis: 100%;
    font-size: 12px;
    line-height: 1;
  }
`

// Applied-filter chips + "Clear all". Sits inline after the count on desktop; wraps to its own full
// line below the count/right controls on mobile (order 3 + flex-basis 100%).
export const Chips = styled.div`
  order: 2;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;

  ${media.maxWidth('lg')} {
    order: 4;
    flex-basis: 100%;
    gap: 4px;
  }
`

// A removable applied-filter chip: dark gray-0 pill, white label, trailing ✕.
export const Chip = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 8px 6px 12px;
  border: 0;
  border-radius: ${radius.pill};
  background: rgba(0, 0, 0, 0.3);
  color: ${colors.white};
  font-weight: 400;
  font-size: 12px;
  line-height: 1.43;
  white-space: nowrap;
  cursor: pointer;

  ${media.maxWidth('lg')} {
    font-size: 10px;
  }

  &:hover {
    background: ${colors.text};
  }
  &:focus-visible {
    outline: 2px solid ${colors.accent};
    outline-offset: 2px;
  }
`

export const ChipClose = styled(Icon)`
  width: 14px;
  height: 14px;
  color: ${colors.white};
`

// "Clear all" — underlined text link. Also used by the inline filter row (Collection/Creator).
export const ClearAll = styled.button`
  padding: 0 4px;
  background: none;
  border: 0;
  color: ${colors.gray4};
  font-weight: 500;
  font-size: 12px;
  line-height: 1.43;
  text-decoration: underline;
  white-space: nowrap;
  cursor: pointer;

  &:hover {
    color: ${colors.white};
  }

  &:focus-visible {
    outline: 2px solid ${colors.accent};
    outline-offset: 2px;
  }
`

// The page-scoped search slot (FilterBar's `search` prop). Deliberately INSIDE Right rather than a
// Toolbar child of its own: Right already carries the toolbar's single `margin-left: auto`, and a second
// auto margin out here would have split the free space between the two and parked the field halfway
// across the row instead of grouping it with Sort By.
export const Search = styled.div`
  flex: 0 1 405px;
  min-width: 200px;

  ${media.maxWidth('lg')} {
    /* Shares the first row with Sort By + Filters, taking whatever they leave; the count drops below. */
    order: 1;
    flex: 1 1 auto;
    min-width: 130px;
  }
`

// The right-hand controls group: Sort By (always) + the mobile-only Filters pill.
export const Right = styled.div`
  order: 4;
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;

  /* Sort By carries no height of its own — it is sized by its 12px label plus a 24px chevron, which lands
     at 34px and left it visibly shorter than the 40px search field beside it. Pinned here, on the toolbar,
     rather than on the Dropdown itself: that component is also used inside filter popovers and a modal,
     where 40px is not the right size. Every toolbar gets the same pair of 40px controls. */
  & [data-dropdown-trigger] {
    height: 40px;
  }

  ${media.maxWidth('lg')} {
    /* First row, beside the search field; the count and chips wrap below. */
    order: 2;
    flex: none;

    /* On mobile the Sort By dropdown is a pill matching the Filters pill (Figma 1304-310201): fully
       rounded, 0.5px gray-3 hairline, title-case (not the desktop uppercase), same 28px height. */
    & [data-dropdown-trigger] {
      height: 36px;
      padding: 8px 8px 8px 12px;
      border-radius: 32px;
      border: 1px solid ${colors.softWhite};
      color: ${colors.softWhite};
      background: rgba(255, 255, 255, 0.1);
      font-size: 12px;
      font-weight: 500;
      text-transform: none;
    }
  }
`

// Mobile "Filters" trigger (Figma node 1304:310201): a pill matching the Sort By pill — white, 0.5px
// gray-3 hairline, fully rounded, "Filters" label + a filter glyph. Hidden on desktop (the sidebar is
// always visible there).
export const FiltersPill = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 36px;
  padding: 8px 8px 8px 12px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid ${colors.softWhite};
  border-radius: 32px;
  color: ${colors.softWhite};
  font-weight: 500;
  font-size: 12px;
  line-height: 1.43;
  white-space: nowrap;
  cursor: pointer;

  ${media.minWidth('lg')} {
    display: none;
  }

  &:hover {
    background: rgba(255, 255, 255, 0.12);
  }
  &:focus-visible {
    outline: 2px solid ${colors.accent};
    outline-offset: 2px;
  }
`

export const FiltersPillIcon = styled(Icon)`
  width: 20px;
  height: 20px;
  color: #ecebed;
`

// Inline filter row for Collection/Creator (they keep Rarity/Price as bar pills rather than a sidebar).
export const Filters = styled.div`
  order: 2;
  display: flex;
  align-items: center;
  gap: 8px;
`

// A single inline filter (Rarity/Price) trigger + its popover host (Collection/Creator).
export const Item = styled.div`
  position: relative;
`

// data-open / data-active darken the label.
export const Trigger = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: 0;
  padding: 8px 10px;
  border-radius: 8px;
  color: ${colors.gray4};
  font-weight: 600;
  font-size: 14px;
  white-space: nowrap;
  cursor: pointer;

  &:hover {
    background: rgba(255, 255, 255, 0.08);
    color: ${colors.white};
  }
  &[data-open],
  &[data-active] {
    color: ${colors.white};
  }
  &:focus-visible {
    outline: 2px solid ${colors.accent};
    outline-offset: 2px;
  }
`

export const Badge = styled.span`
  display: inline-grid;
  place-items: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 999px;
  background: ${colors.accent};
  color: ${colors.white};
  font-size: 11px;
  font-weight: 700;
`

// Click-away scrim behind an open inline popover / the Sort menu (Collection/Creator).
export const Scrim = styled.div`
  position: fixed;
  inset: 0;
  z-index: 34;
`
