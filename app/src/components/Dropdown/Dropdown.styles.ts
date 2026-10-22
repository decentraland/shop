import styled from '@emotion/styled'
import { theme } from '~/styles/theme'

const { colors, font, radius } = theme

export const Root = styled.div`
  position: relative;
  display: inline-block;
`

export const Trigger = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 4px 4px 4px 12px;
  background: rgba(0, 0, 0, 0.12);
  border: 0.5px solid ${colors.muted2};
  border-radius: ${radius.btn};
  color: #ecebed;
  font-weight: 600;
  font-size: 12px;
  line-height: 1.43;
  text-transform: uppercase;
  white-space: nowrap;
  cursor: pointer;
  transition: border-color 0.15s ease;

  &:hover {
    border-color: ${colors.white};
  }
  &:focus-visible {
    outline: 0;
    border-color: ${colors.accent};
  }
`

export const Label = styled.span`
  overflow: hidden;
  text-overflow: ellipsis;
`

// cart-pop-in is a global keyframe (index.css).
export const Menu = styled.div`
  position: absolute;
  top: calc(100% + 8px);
  z-index: 40;
  min-width: 174px;
  max-width: calc(100vw - 32px);
  overflow: hidden;
  background: ${colors.white};
  border-radius: ${radius.btn};
  box-shadow: 0 4px 25px 5px rgba(0, 0, 0, 0.25);
  animation: cart-pop-in 0.16s ease;

  &[data-align='left'] {
    left: 0;
  }
  &[data-align='right'] {
    right: 0;
  }
  &[data-searchable] {
    width: 300px;
  }
`

export const Search = styled.label`
  display: flex;
  align-items: center;
  gap: 8px;
  height: 40px;
  margin: 8px;
  padding: 0 12px;
  border: 1px solid transparent;
  border-radius: ${radius.btn};
  background: #f5f4f7;
  cursor: text;

  &:focus-within {
    border-color: ${colors.accent};
  }
  input {
    flex: 1;
    min-width: 0;
    border: 0;
    outline: none;
    background: transparent;
    font-family: ${font.sans};
    font-size: 14px;
    color: ${colors.gray0};

    &::placeholder {
      color: ${colors.muted};
    }
    &::-webkit-search-cancel-button {
      display: none;
    }
  }
`

// A long list scrolls inside the menu, and the page stays put when it reaches either end.
export const List = styled.ul`
  max-height: 320px;
  overflow-y: auto;
  overscroll-behavior: contain;
  list-style: none;
  margin: 0;
  padding: 0;

  [data-searchable] > & {
    border-top: 1px solid rgba(22, 21, 24, 0.08);
  }
`

export const Empty = styled.li`
  padding: 12px;
  font-size: 14px;
  color: ${colors.muted};
`

export const Option = styled.button`
  display: flex;
  align-items: center;
  width: 100%;
  height: 40px;
  text-align: left;
  background: ${colors.white};
  border: 0;
  padding: 4px 4px 4px 8px;
  font-weight: 400;
  font-size: 14px;
  line-height: 1.43;
  color: ${colors.gray0};
  white-space: nowrap;
  cursor: pointer;

  &[data-rich] {
    gap: 12px;
    height: 52px;
    padding: 8px 12px 8px 8px;
  }
  &:hover,
  &[data-highlight] {
    background: #f5f4f7;
  }
  &[data-active] {
    background: ${colors.media};
  }
`

export const OptionText = styled.span`
  display: flex;
  flex-direction: column;
  min-width: 0;

  span,
  small {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  small {
    font-size: 12px;
    line-height: 1.33;
    color: ${colors.muted};
  }
`

export const OptionMedia = styled.span`
  flex: none;
  width: 36px;
  height: 36px;
  border-radius: 8px;
  overflow: hidden;
  background: #f5f4f7;
`
