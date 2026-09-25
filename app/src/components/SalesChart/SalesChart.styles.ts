import styled from '@emotion/styled'
import { theme } from '~/styles/theme'

export const Root = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
`

export const Legend = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  font-family: ${theme.font.sans};
  font-size: 12px;
  color: ${theme.colors.softWhite};
`

export const Key = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 8px;
`

export const KeyLine = styled.span`
  width: 16px;
  height: 2px;
  border-radius: 1px;
`

export const Plot = styled.div`
  position: relative;
  width: 100%;
  touch-action: pan-y;
  border-radius: 8px;

  &:focus-visible {
    outline: 2px solid ${theme.colors.softWhite};
    outline-offset: 4px;
  }

  svg {
    display: block;
  }

  .tick {
    fill: rgba(255, 255, 255, 0.6);
    font-family: ${theme.font.sans};
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }

  /* A surface-coloured ring keeps the marker legible where it crosses the other line. */
  .dot {
    stroke: ${theme.colors.blackBtn};
    stroke-width: 2;
  }
`

export const Tip = styled.div`
  position: absolute;
  top: 0;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 10px;
  border-radius: 8px;
  background: ${theme.colors.blackBtn};
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
  color: ${theme.colors.softWhite};
  font-family: ${theme.font.sans};
  font-size: 12px;
  white-space: nowrap;
  pointer-events: none;
`

export const TipRow = styled.span`
  display: flex;
  align-items: center;
  gap: 8px;

  b {
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  span {
    color: rgba(255, 255, 255, 0.65);
  }
`

export const TipLine = styled.span`
  width: 12px;
  height: 2px;
  border-radius: 1px;
`

export const Hidden = styled.div`
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
`
