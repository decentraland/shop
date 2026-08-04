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
  color: ${colors.muted};
  font-weight: 400;
  font-size: 14px;
  line-height: 1.43;
  white-space: nowrap;

  ${media.maxWidth('lg')} {
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
    order: 3;
    flex-basis: 100%;
    gap: 4px;
  }
`

// A removable applied-filter chip: dark gray-0 pill, white label, trailing ✕.
export const Chip = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 4px 2px 8px;
  border: 0;
  border-radius: ${radius.pill};
  background: ${colors.gray0};
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
  color: ${colors.text2};
  font-weight: 500;
  font-size: 12px;
  line-height: 1.43;
  text-decoration: underline;
  white-space: nowrap;
  cursor: pointer;

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
    /* Its own full-width line above Sort/Filters. Sharing a row at this width collapses the field to
       roughly its icon, which is worse than the extra line. */
    order: -1;
    flex: 1 0 100%;
  }
`

// The right-hand controls group: Sort By (always) + the mobile-only Filters pill.
export const Right = styled.div`
  order: 4;
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;

  ${media.maxWidth('lg')} {
    /* Keep the count + Sort/Filters pills on the first row; chips (order 3) wrap below. */
    order: 2;
    /* Lets the search slot above take a line of its own. No effect without it: with just the two pills
       there is no 100%-basis child to wrap. */
    flex-wrap: wrap;

    /* On mobile the Sort By dropdown is a pill matching the Filters pill (Figma 1304-310201): fully
       rounded, 0.5px gray-3 hairline, title-case (not the desktop uppercase), same 28px height. */
    & [data-dropdown-trigger] {
      height: 28px;
      padding: 4px 4px 4px 12px;
      border-radius: 32px;
      border-width: 0.5px;
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
  height: 28px;
  padding: 4px 8px 4px 12px;
  background: ${colors.white};
  border: 0.5px solid ${colors.muted2};
  border-radius: 32px;
  color: ${colors.text2};
  font-weight: 500;
  font-size: 12px;
  line-height: 1.43;
  white-space: nowrap;
  cursor: pointer;

  ${media.minWidth('lg')} {
    display: none;
  }

  &:hover {
    background: ${colors.chip};
  }
  &:focus-visible {
    outline: 2px solid ${colors.accent};
    outline-offset: 2px;
  }
`

export const FiltersPillIcon = styled(Icon)`
  width: 20px;
  height: 20px;
  color: ${colors.text2};
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
  color: #6b6873;
  font-weight: 600;
  font-size: 14px;
  white-space: nowrap;
  cursor: pointer;

  &:hover {
    background: #f5f4f7;
    color: #3f3c47;
  }
  &[data-open],
  &[data-active] {
    color: #3f3c47;
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
