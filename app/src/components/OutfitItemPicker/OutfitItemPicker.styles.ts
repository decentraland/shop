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
  border: 1px solid rgba(255, 255, 255, 0.45);
  border-radius: ${radius.pill};
  padding: 0 14px;
  height: 44px;
  background: rgba(0, 0, 0, 0.25);
  color: ${colors.softWhite};

  input {
    flex: 1;
    min-width: 0;
    border: 0;
    outline: 0;
    background: none;
    font: inherit;
    color: ${colors.softWhite};
  }
  input::placeholder {
    color: ${colors.muted2};
  }
`

export const Hint = styled.p`
  margin: 0;
  font-size: 13px;
  color: ${colors.gray4};
`

export const Categories = styled.div`
  display: flex;
  gap: 8px;
`

export const CategoryBtn = styled.button`
  min-height: 44px;
  padding: 0 16px;
  border-radius: ${radius.pill};
  border: 1px solid rgba(255, 255, 255, 0.45);
  background: none;
  font: inherit;
  font-weight: 600;
  color: ${colors.softWhite};
  cursor: pointer;

  &[data-selected] {
    border-color: ${colors.softWhite};
    background: ${colors.softWhite};
    color: ${colors.text};
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
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid transparent;
  border-radius: ${radius.card};
  text-align: left;
  font: inherit;
  color: ${colors.softWhite};
  cursor: pointer;

  &:hover:not(:disabled) {
    border-color: ${colors.magenta};
  }

  &[data-selected] {
    border-color: ${colors.softWhite};
    box-shadow: 0 0 0 1px ${colors.softWhite};
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
  color: ${colors.gray4};
`

export const Check = styled(Icon)`
  position: absolute;
  top: 12px;
  right: 12px;
  color: ${colors.accent};
  background: ${colors.white};
  border-radius: 50%;
`
