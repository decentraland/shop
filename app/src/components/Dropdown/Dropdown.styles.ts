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
  height: 40px;
  padding: 4px 4px 4px 12px;
  background: transparent;
  border: 0.5px solid ${colors.white};
  border-radius: ${radius.btn};
  color: ${colors.white};
  font-weight: 500;
  font-size: 12px;
  line-height: 1.43;
  text-transform: uppercase;
  white-space: nowrap;
  cursor: pointer;
  transition:
    background 0.15s ease,
    border-color 0.15s ease;

  &:hover {
    background: ${colors.glassStrong};
    border-color: ${colors.softWhite};
  }
  &[data-open] {
    background: ${colors.glass};
  }
  &:focus-visible {
    outline: 2px solid ${colors.white};
    outline-offset: 2px;
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
  background: ${colors.gray0};
  backdrop-filter: blur(6px);
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
  background: transparent;
  border: 0;
  padding: 4px 4px 4px 8px;
  font-weight: 400;
  font-size: 14px;
  line-height: 1.43;
  color: ${colors.gray4};
  white-space: nowrap;
  cursor: pointer;

  &:hover {
    background: ${colors.glassFaint};
  }
  &[data-active] {
    background: ${colors.glassFaint};
    color: ${colors.white};
  }
`
