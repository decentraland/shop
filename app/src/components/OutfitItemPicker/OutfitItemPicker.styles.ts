import styled from '@emotion/styled'
import { Icon } from '~/components/Icon'
import { theme } from '~/styles/theme'

const { colors, radius, media } = theme

export const Root = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`

export const Search = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid ${colors.lineStrong};
  border-radius: ${radius.pill};
  padding: 0 14px;
  height: 44px;

  input {
    flex: 1;
    min-width: 0;
    border: 0;
    outline: 0;
    background: none;
    font: inherit;
    color: ${colors.text};
  }
`

export const Categories = styled.div`
  display: flex;
  gap: 8px;
`

export const CategoryBtn = styled.button`
  min-height: 44px;
  padding: 0 16px;
  border-radius: ${radius.pill};
  border: 1px solid ${colors.lineStrong};
  background: none;
  font: inherit;
  font-weight: 600;
  color: ${colors.text};
  cursor: pointer;

  &[data-selected] {
    border-color: ${colors.accent};
    background: ${colors.accent};
    color: ${colors.white};
  }
`

export const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 10px;

  ${media.maxWidth('mobile')} {
    grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  }
`

export const Placeholder = styled.span`
  height: 190px;
  border-radius: ${radius.card};
`

export const Item = styled.button`
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  background: ${colors.bg};
  border: 1px solid ${colors.line};
  border-radius: ${radius.card};
  text-align: left;
  font: inherit;
  color: ${colors.text};
  cursor: pointer;

  &:hover:not(:disabled) {
    border-color: ${colors.magenta};
  }

  &[data-selected] {
    border-color: ${colors.accent};
    box-shadow: 0 0 0 1px ${colors.accent};
  }

  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
`

export const Thumb = styled.img`
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
  border-radius: 8px;
  background: ${colors.media};
`

export const Name = styled.span`
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`

export const Price = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: ${colors.muted};
`

export const Check = styled(Icon)`
  position: absolute;
  top: 12px;
  right: 12px;
  color: ${colors.accent};
  background: ${colors.bg};
  border-radius: 50%;
`
