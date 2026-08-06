import styled from '@emotion/styled'
import { Link } from 'react-router-dom'
import { Icon } from '~/components/Icon'
import { ManaPricingBanner } from '~/components/ManaPricingBanner'
import { noForward } from '~/styles/emotion'
import { theme } from '~/styles/theme'

// My Assets reuses the Collectibles browse shell (Root = sidebar + Main; see Assets.styles) so the
// two pages read as the same product. The pieces below are the My-Assets-specific sidebar chrome: the
// "ASSETS" section switcher, contextual filter groups, and the top search field.

// ---------------- Sidebar: section switcher (Wearables / Emotes / Names / My Creations) ----------

export const Group = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
`

// Uppercase group heading — mirrors the classic marketplace sidebar's "ASSETS"/"STORE" sub-headers.
export const GroupTitle = styled.h2`
  margin: 0;
  padding: 4px 4px 2px;
  font-family: ${theme.font.sans};
  font-weight: 700;
  font-size: 12px;
  letter-spacing: 0.46px;
  text-transform: uppercase;
  color: ${theme.colors.muted};
`

// A section entry. Selected reads as a light-gray filled pill (matches the CategoryFilter flat style).
export const SectionButton = styled('button', noForward('selected'))<{ selected?: boolean }>`
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  height: 40px;
  padding: 4px 12px;
  border: 0;
  border-radius: 8px;
  background: ${({ selected }) => (selected ? theme.colors.media : 'transparent')};
  color: ${theme.colors.text};
  font-family: ${theme.font.sans};
  font-weight: ${({ selected }) => (selected ? 600 : 400)};
  font-size: 14px;
  text-align: left;
  cursor: pointer;

  @media (hover: hover) {
    &:hover {
      background: ${theme.colors.media};
    }
  }
  &:focus-visible {
    outline: 2px solid ${theme.colors.accent};
    outline-offset: 2px;
  }
`

export const SectionIcon = styled(Icon)`
  width: 18px;
  height: 18px;
  flex: none;
  color: ${theme.colors.muted};
`

// ---------------- Sidebar: contextual filter groups ----------------

// Static (always-open) filter group: an uppercase title + its controls. Matches the collapsed-section
// look of the Collectibles Filters without the accordion (My Assets keeps every group open).
export const FilterGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
`

export const FilterTitle = styled.span`
  font-family: ${theme.font.sans};
  font-weight: 600;
  font-size: 14px;
  line-height: 1.43;
  color: ${theme.colors.text};
  padding: 0 4px;
`

// Sub-category chips (wearable/emote only) — the same pill aesthetic as the rarity chips.
export const SubPills = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 4px;
`

export const SubPill = styled('button', noForward('selected'))<{ selected?: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 6px;
  background: ${({ selected }) => (selected ? theme.colors.text : theme.colors.softWhite)};
  border: ${({ selected }) => (selected ? `1px solid ${theme.colors.text}` : `0.5px solid ${theme.colors.gray4}`)};
  color: ${({ selected }) => (selected ? theme.colors.white : theme.colors.gray0)};
  font-family: ${theme.font.sans};
  font-weight: ${({ selected }) => (selected ? 600 : 400)};
  font-size: 12px;
  cursor: pointer;

  &:hover {
    border-color: ${theme.colors.text};
  }
  &:focus-visible {
    outline: 2px solid ${theme.colors.accent};
    outline-offset: 2px;
  }
`

// ---------------- Main: search field ----------------

// Lives in the FilterBar toolbar now (see MyAssets' `search` slot), so it carries no bottom margin of its
// own — the toolbar's own margin is what separates the row from the grid — and it fills the width the slot
// gives it instead of the whole main column.
export const SearchBar = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: 40px;
  padding: 0 12px;
  border: 1px solid ${theme.colors.lineStrong};
  border-radius: ${theme.radius.btn};
  background: ${theme.colors.white};

  &:focus-within {
    border-color: ${theme.colors.accent};
  }
`

export const SearchIcon = styled(Icon)`
  width: 18px;
  height: 18px;
  flex: none;
  color: ${theme.colors.muted};
`

export const SearchInput = styled.input`
  flex: 1;
  min-width: 0;
  border: 0;
  background: none;
  padding: 0;
  font-family: ${theme.font.sans};
  font-size: 14px;
  color: ${theme.colors.text};

  &::placeholder {
    color: ${theme.colors.muted2};
  }
  &:focus {
    outline: 0;
  }
`

export const SearchClear = styled.button`
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border: 0;
  border-radius: 50%;
  background: ${theme.colors.chip};
  color: ${theme.colors.text};
  cursor: pointer;
  flex: none;

  &:focus-visible {
    outline: 2px solid ${theme.colors.accent};
    outline-offset: 2px;
  }
`

export const ClearIcon = styled(Icon)`
  width: 12px;
  height: 12px;
`

// ---------------- Main: grid ----------------

// Same responsive card grid the Collectibles page uses (see index.css `.grid`); pinned here so My
// Assets doesn't depend on that legacy class. 300px card height comes from .card itself.
export const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
  gap: 20px;

  ${theme.media.maxWidth('sm')} {
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 12px;
  }
`

export const Empty = styled.p`
  margin: 24px 0;
  font-family: ${theme.font.sans};
  font-size: 14px;
  color: ${theme.colors.muted};
`

// Friendly empty state (centered card) shown when a section has no items.
// The shared empty-state panel (Figma 2103:411675). This was the last one still on the light theme —
// a near-black title and a light grey body on the purple field, in a violet-circle-plus-glyph shell
// the design does not have.
export const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 24px;
  padding: 48px 16px;
  border-radius: 16px;
  background: rgba(0, 0, 0, 0.2);
  text-align: center;
  color: ${theme.colors.softWhite};
`
export const EmptyIcon = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 138px;
  height: 138px;
  color: ${theme.colors.dclRed};
`
// Title and body are one block: 12px apart from each other, 24px from the icon and the CTA.
export const EmptyCopy = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding-bottom: 16px;
`

export const EmptyTitle = styled.p`
  margin: 0;
  font-family: ${theme.font.sans};
  font-size: 20px;
  font-weight: 700;
  line-height: 1.6;
`
export const EmptyText = styled.p`
  margin: 0;
  max-width: 520px;
  font-family: ${theme.font.sans};
  font-size: 16px;
  font-weight: 400;
  line-height: 1.6;
`
export const EmptyCta = styled(Link)`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 310px;
  max-width: 100%;
  height: 52px;
  padding: 0 12px;
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.4);
  color: ${theme.colors.softWhite};
  font-family: ${theme.font.sans};
  font-size: 15px;
  font-weight: 600;
  line-height: 24px;
  letter-spacing: 0.46px;
  text-transform: uppercase;
  text-decoration: none;
  cursor: pointer;
  transition: background 0.15s ease;

  &:hover {
    background: rgba(0, 0, 0, 0.55);
  }
`

// Sign-in gate (no connected account).
export const Gate = styled.section`
  max-width: 520px;
  margin: 48px auto;
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 16px;
  align-items: center;
`

export const GateTitle = styled.h1`
  margin: 0;
  font-family: ${theme.font.sans};
  font-weight: 700;
  font-size: 24px;
  color: ${theme.colors.softWhite};
`

export const GateText = styled.p`
  margin: 0;
  font-family: ${theme.font.sans};
  font-size: 15px;
  color: ${theme.colors.gray4};
`

// Import banner (surfaces classic listings the seller can bring into the Shop).
export const ImportBanner = styled(ManaPricingBanner)`
  margin-bottom: 16px;
`
