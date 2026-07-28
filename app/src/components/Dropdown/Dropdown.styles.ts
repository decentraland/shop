import styled from '@emotion/styled'
import { theme } from '~/styles/theme'

const { colors, radius } = theme

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
  background: ${colors.softWhite};
  border: 1px solid ${colors.text2};
  border-radius: ${radius.btn};
  color: ${colors.text2};
  font-weight: 600;
  font-size: 12px;
  line-height: 1.43;
  text-transform: uppercase;
  white-space: nowrap;
  cursor: pointer;
  transition: border-color 0.15s ease;

  &:hover {
    border-color: #000;
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
export const Menu = styled.ul`
  position: absolute;
  top: calc(100% + 8px);
  z-index: 40;
  min-width: 174px;
  list-style: none;
  margin: 0;
  padding: 0;
  overflow: hidden;
  background: #fff;
  border-radius: ${radius.btn};
  box-shadow: 0 4px 25px 5px rgba(0, 0, 0, 0.25);
  animation: cart-pop-in 0.16s ease;

  &[data-align='left'] {
    left: 0;
  }
  &[data-align='right'] {
    right: 0;
  }
`

export const Option = styled.button`
  display: flex;
  align-items: center;
  width: 100%;
  height: 40px;
  text-align: left;
  background: #fff;
  border: 0;
  padding: 4px 4px 4px 8px;
  font-weight: 400;
  font-size: 14px;
  line-height: 1.43;
  color: ${colors.gray0};
  white-space: nowrap;
  cursor: pointer;

  &:hover {
    background: #f5f4f7;
  }
  &[data-active] {
    background: ${colors.media};
  }
`
