import styled from '@emotion/styled'
import { Icon } from '~/components/Icon'
import { noForward } from '~/styles/emotion'
import { theme } from '~/styles/theme'

// Category filter (Figma desktop node 1256-293384 / mobile 1304-307983): a plain white column of
// selectable rows. Top categories are semibold; expandable ones (Wearables/Emotes) carry a chevron and
// fill with gray-5 while open, revealing an accordion of icon'd sub-categories. Rows are 40px on
// desktop, 52px in the mobile filters sheet.

export const Root = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`

export const Title = styled.p`
  font-family: ${theme.font.sans};
  font-weight: 600;
  font-size: 13px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #6a6a6a;
  margin: 0 0 4px;
  padding: 8px 16px 0;
`

export const Group = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`

export const CatButton = styled('button', noForward('flat'))<{ flat?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  height: 40px;
  padding: 4px 8px;
  border: 0;
  border-radius: 4px;
  background: none;
  width: 100%;
  text-align: left;
  color: ${theme.colors.text};
  cursor: pointer;

  ${theme.media.down('lg')} {
    height: 52px;
  }

  &:hover {
    background: ${({ flat }) => (flat ? 'rgba(0, 0, 0, 0.04)' : '#f5f4f7')};
  }
  &.is-selected,
  &.is-expanded {
    background: ${({ flat }) => (flat ? '#ececec' : theme.colors.media)};
  }
  &:focus-visible {
    outline: 2px solid ${theme.colors.accent};
    outline-offset: 2px;
  }
`

export const CatLabel = styled.span`
  font-family: ${theme.font.sans};
  font-weight: 600;
  font-size: 14px;
  line-height: 1.5;
  color: ${theme.colors.text};

  ${theme.media.down('lg')} {
    font-size: 16px;
  }
`

export const Subs = styled.div`
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 0.22s ease;

  &.is-open {
    grid-template-rows: 1fr;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`

export const SubsInner = styled.div`
  overflow: hidden;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
`

export const SubButton = styled('button', noForward('flat'))<{ flat?: boolean }>`
  display: flex;
  align-items: center;
  gap: 8px;
  height: 40px;
  padding: 4px 4px 4px 24px;
  border: 0;
  border-radius: 4px;
  background: none;
  width: 100%;
  text-align: left;
  cursor: pointer;

  ${theme.media.down('lg')} {
    height: 52px;
  }

  &:hover {
    background: ${({ flat }) => (flat ? 'rgba(0, 0, 0, 0.04)' : '#f5f4f7')};
  }
  &.is-active {
    background: ${({ flat }) => (flat ? '#ececec' : theme.colors.media)};
  }
  &:focus-visible {
    outline: 2px solid ${theme.colors.accent};
    outline-offset: 2px;
  }
`

export const SubLeft = styled.span`
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
`

// Sub-category glyphs render black (Figma) — set the color explicitly so the currentColor mask never
// inherits a UA button accent (the blue-on-mobile bug).
export const SubIcon = styled(Icon)`
  width: 24px;
  height: 24px;
  color: ${theme.colors.gray0};
`

export const SubLabel = styled('span', noForward('active'))<{ active?: boolean }>`
  font-family: ${theme.font.sans};
  font-weight: ${({ active }) => (active ? 600 : 400)};
  font-size: 14px;
  line-height: 1.5;
  color: ${({ active }) => (active ? theme.colors.text : theme.colors.gray0)};

  ${theme.media.down('lg')} {
    font-size: 16px;
  }
`
