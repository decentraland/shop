import styled from '@emotion/styled'
import { Icon } from '~/components/Icon'
import { theme } from '~/styles/theme'

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

// Item count (Figma typography/body2): Inter 14px gray-2 on desktop, 12px on mobile.
export const Count = styled.span`
  order: 1;
  color: ${theme.colors.muted};
  font-weight: 400;
  font-size: 14px;
  line-height: 1.43;
  white-space: nowrap;

  ${theme.media.down('lg')} {
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

  ${theme.media.down('lg')} {
    order: 3;
    flex-basis: 100%;
    gap: 4px;
  }
`

// A removable applied-filter chip: dark gray-0 pill, white label, trailing ✕ (Figma "Filter chip").
export const Chip = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 4px 2px 8px;
  border: 0;
  border-radius: ${theme.radius.pill};
  background: ${theme.colors.gray0};
  color: ${theme.colors.white};
  font-weight: 400;
  font-size: 12px;
  line-height: 1.43;
  white-space: nowrap;
  cursor: pointer;

  ${theme.media.down('lg')} {
    font-size: 10px;
  }

  &:hover {
    background: ${theme.colors.text};
  }
  &:focus-visible {
    outline: 2px solid ${theme.colors.accent};
    outline-offset: 2px;
  }
`

export const ChipClose = styled(Icon)`
  width: 14px;
  height: 14px;
  color: ${theme.colors.white};
`

// "Clear all" — underlined text link (Figma node 1304:313070 / 1304:302542).
export const ClearAll = styled.button`
  padding: 0 4px;
  background: none;
  border: 0;
  color: ${theme.colors.text2};
  font-weight: 500;
  font-size: 12px;
  line-height: 1.43;
  text-decoration: underline;
  white-space: nowrap;
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid ${theme.colors.accent};
    outline-offset: 2px;
  }
`

// The right-hand controls group: Sort By (always) + the mobile-only Filters pill.
export const Right = styled.div`
  order: 4;
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;

  ${theme.media.down('lg')} {
    /* Keep the count + Sort/Filters pills on the first row; chips (order 3) wrap below. */
    order: 2;
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
  background: ${theme.colors.white};
  border: 0.5px solid ${theme.colors.muted2};
  border-radius: 32px;
  color: ${theme.colors.text2};
  font-weight: 500;
  font-size: 12px;
  line-height: 1.43;
  white-space: nowrap;
  cursor: pointer;

  ${theme.media.up('lg')} {
    display: none;
  }

  &:hover {
    background: ${theme.colors.chip};
  }
  &:focus-visible {
    outline: 2px solid ${theme.colors.accent};
    outline-offset: 2px;
  }
`

export const FiltersPillIcon = styled(Icon)`
  width: 20px;
  height: 20px;
  color: ${theme.colors.text2};
`

// Inline filter row for Collection/Creator (they keep Rarity/Price as bar pills rather than a sidebar).
export const InlineFilters = styled.div`
  order: 2;
  display: flex;
  align-items: center;
  gap: 8px;
`

// A single inline filter (Rarity/Price) trigger + its popover host (Collection/Creator).
export const FilterItem = styled.div`
  position: relative;
`

export const FilterTrigger = styled.button`
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
  &.is-open,
  &.is-active {
    color: #3f3c47;
  }
  &:focus-visible {
    outline: 2px solid ${theme.colors.accent};
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
  background: ${theme.colors.accent};
  color: #fff;
  font-size: 11px;
  font-weight: 700;
`

// Click-away scrim behind an open inline popover / the Sort menu (Collection/Creator).
export const Scrim = styled.div`
  position: fixed;
  inset: 0;
  z-index: 34;
`
