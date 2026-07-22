import styled from '@emotion/styled'
import { Link } from 'react-router-dom'
import { Icon } from '~/components/Icon'
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

export const SearchBar = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  height: 44px;
  padding: 0 12px;
  margin-bottom: 16px;
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

  ${theme.media.down('sm')} {
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
export const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 72px 24px;
  text-align: center;
`
export const EmptyIcon = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 72px;
  height: 72px;
  margin-bottom: 10px;
  border-radius: 50%;
  background: ${theme.colors.navViolet};
  color: ${theme.colors.accent};
`
export const EmptyTitle = styled.p`
  margin: 0;
  font-family: ${theme.font.sans};
  font-size: 18px;
  font-weight: 600;
  color: ${theme.colors.text};
`
export const EmptyText = styled.p`
  margin: 0;
  max-width: 360px;
  font-family: ${theme.font.sans};
  font-size: 14px;
  line-height: 1.5;
  color: ${theme.colors.muted};
`
export const EmptyCta = styled(Link)`
  margin-top: 12px;
  display: inline-flex;
  align-items: center;
  height: 40px;
  padding: 0 20px;
  border-radius: 8px;
  background: ${theme.colors.accent};
  color: #fff;
  font-family: ${theme.font.sans};
  font-size: 14px;
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;

  &:hover {
    background: ${theme.colors.accentHover};
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
  color: ${theme.colors.text};
`

export const GateText = styled.p`
  margin: 0;
  font-family: ${theme.font.sans};
  font-size: 15px;
  color: ${theme.colors.muted};
`

// Import banner (surfaces classic listings the seller can bring into the Shop).
export const ImportBanner = styled(Link)`
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  padding: 12px 16px;
  border-radius: ${theme.radius.btn};
  background: ${theme.colors.rarityBg};
  color: ${theme.colors.text};
  text-decoration: none;

  &:hover {
    filter: brightness(0.98);
  }
  &:focus-visible {
    outline: 2px solid ${theme.colors.accent};
    outline-offset: 2px;
  }
`

export const ImportText = styled.span`
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  font-family: ${theme.font.sans};
`

export const ImportTitle = styled.strong`
  font-weight: 600;
  font-size: 14px;
  color: ${theme.colors.text};
`

export const ImportSub = styled.span`
  font-size: 12px;
  color: ${theme.colors.muted};
`

export const ImportCta = styled.span`
  flex: none;
  font-weight: 600;
  font-size: 13px;
  color: ${theme.colors.accent};
  text-transform: uppercase;
  letter-spacing: 0.046em;
`
