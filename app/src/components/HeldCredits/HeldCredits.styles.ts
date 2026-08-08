import styled from '@emotion/styled'
import { theme } from '~/styles/theme'

const { colors, radius, font } = theme

export const Root = styled.div`
  position: relative;
  display: flex;
  align-items: center;
`

export const Trigger = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border: 0;
  border-radius: ${radius.pill};
  background: ${colors.promptAmber};
  color: ${colors.blackBtn};
  font-family: ${font.sans};
  font-size: 13px;
  font-weight: 600;
  line-height: 1;
  cursor: pointer;
  white-space: nowrap;

  &:hover {
    filter: brightness(0.97);
  }
`

export const Panel = styled.div`
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: ${theme.z.tooltip};
  width: 268px;
  padding: 14px;
  border-radius: ${radius.modal};
  background: ${colors.white};
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
  font-family: ${font.sans};
  color: ${colors.blackBtn};
  text-align: left;
`

export const Title = styled.p`
  margin: 0 0 6px;
  font-size: 14px;
  font-weight: 700;
`

export const Body = styled.p`
  margin: 0 0 10px;
  font-size: 13px;
  line-height: 1.45;
`

/* The countdown itself. Tabular figures so the seconds ticking down do not shift the text around it. */
export const Countdown = styled.span`
  font-variant-numeric: tabular-nums;
  font-weight: 700;
`

export const Caveat = styled.p`
  margin: 0;
  font-size: 12px;
  line-height: 1.4;
  color: ${colors.blackBtn};
  opacity: 0.65;
`
