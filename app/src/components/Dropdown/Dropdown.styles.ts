import styled from '@emotion/styled'
import { theme } from '~/styles/theme'

const { colors, radius } = theme

export const Root = styled.div`
  position: relative;
  display: inline-block;
`

// Metrics pinned to the Figma "Sort By" component: Inter Medium 12px, a hairline gray border, an 8px
// radius, a 40px content-hugging pill. `data-open` = light-gray gradient + borderless (see Chevron).
export const Trigger = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  height: 40px;
  padding: 0 4px 0 12px;
  background: #fff;
  border: 0.5px solid ${colors.lineStrong};
  border-radius: ${radius.btn};
  color: ${colors.text2};
  font-weight: 500;
  font-size: 12px;
  line-height: 1.43;
  text-transform: uppercase;
  white-space: nowrap;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    background 0.15s ease;

  &:hover {
    border-color: #7c7788;
  }
  &:focus-visible {
    outline: 0;
    border-color: ${colors.accent};
  }
  /* Open wins over :focus-visible (declared after) — gray gradient, borderless. */
  &[data-open] {
    border-color: transparent;
    background: linear-gradient(180deg, #f4f3f6 0%, #dcdae1 100%);
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
  min-width: 100%;
  list-style: none;
  margin: 0;
  padding: 8px;
  background: #fff;
  border-radius: ${radius.card};
  box-shadow: 0 14px 36px rgba(22, 21, 24, 0.16);
  animation: cart-pop-in 0.16s ease;

  &[data-align='left'] {
    left: 0;
  }
  &[data-align='right'] {
    right: 0;
  }
`

export const Option = styled.button`
  display: block;
  width: 100%;
  text-align: left;
  background: none;
  border: 0;
  padding: 12px 16px;
  border-radius: 10px;
  font-size: 16px;
  color: ${colors.text};
  white-space: nowrap;
  cursor: pointer;

  &:hover {
    background: #f5f4f7;
  }
  &[data-active] {
    color: ${colors.accent};
    font-weight: 700;
  }
`
