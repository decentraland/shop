import styled from '@emotion/styled'
import { theme } from '~/styles/theme'

const { colors, media } = theme

export const Toolbar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;

  ${media.maxWidth('mobile')} {
    flex-wrap: wrap;
  }
`

export const Count = styled.span`
  color: ${colors.muted};
  font-weight: 400;
  font-size: 14px;
  line-height: 1.43;
  white-space: nowrap;
`

export const Filters = styled.div``

export const Right = styled.div``

export const Clear = styled.button``

export const Dropdowns = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`

// Mobile-only icon square that opens the off-canvas filters drawer (hidden on desktop).
export const FiltersBtn = styled.button`
  display: none;

  ${media.maxWidth('lg')} {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 4px;
    background: #fff;
    border: 0.5px solid ${colors.lineStrong};
    border-radius: 4px;
    color: ${colors.text2};
    cursor: pointer;
  }
`

export const Item = styled.div`
  position: relative;
`

// data-open / data-active darken the label.
export const Trigger = styled.button`
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

  &:hover {
    background: #f5f4f7;
    color: #3f3c47;
  }
  &[data-open],
  &[data-active] {
    color: #3f3c47;
  }
`

export const Badge = styled.span`
  display: inline-grid;
  place-items: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 999px;
  background: ${colors.accent};
  color: #fff;
  font-size: 11px;
  font-weight: 700;
`

export const Scrim = styled.div`
  position: fixed;
  inset: 0;
  z-index: 34;
`
