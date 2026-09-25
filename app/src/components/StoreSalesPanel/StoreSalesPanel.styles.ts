import styled from '@emotion/styled'
import { Dropdown } from '~/components/Dropdown'
import { theme } from '~/styles/theme'

export const Controls = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
`

export const Metric = styled.div`
  display: flex;
  gap: 4px;
  padding: 4px;
  border-radius: ${theme.radius.pill};
  background: rgba(0, 0, 0, 0.22);
`

export const MetricBtn = styled.button`
  border: 0;
  cursor: pointer;
  min-height: 32px;
  padding: 6px 14px;
  border-radius: ${theme.radius.pill};
  font-family: ${theme.font.sans};
  font-size: 12px;
  font-weight: 600;
  color: rgba(252, 252, 252, 0.62);
  background: transparent;

  &:hover {
    color: ${theme.colors.softWhite};
  }
  &[aria-pressed='true'] {
    background: ${theme.colors.softWhite};
    color: ${theme.colors.text};
  }
  &:focus-visible {
    outline: 2px solid ${theme.colors.softWhite};
    outline-offset: 2px;
  }
`

export const Select = styled(Dropdown)`
  > button {
    gap: 16px;
    height: 40px;
    padding: 4px 4px 4px 12px;
    background: transparent;
    border: 0.5px solid ${theme.colors.white};
    border-radius: ${theme.radius.btn};
    color: ${theme.colors.white};
    font-size: 12px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0;
  }
  > button:hover {
    border-color: ${theme.colors.softWhite};
    background: ${theme.colors.glassFaint};
  }
  > button .ico {
    color: ${theme.colors.softWhite} !important;
  }
`

export const Totals = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 24px;
  font-family: ${theme.font.sans};
`

export const Total = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;

  b {
    font-size: 22px;
    font-weight: 700;
    color: ${theme.colors.white};
  }
  span {
    font-size: 12px;
    color: ${theme.colors.gray4};
  }
  small {
    font-size: 13px;
    font-weight: 600;
  }
  /* The tiles' own delta colours, so a rise reads the same wherever it is shown. */
  small[data-dir='up'] {
    color: ${theme.colors.successBorder};
  }
  small[data-dir='down'] {
    color: #ff6b6b;
  }
`

export const Note = styled.p`
  margin: 0;
  font-family: ${theme.font.sans};
  font-size: 12px;
  color: ${theme.colors.gray4};
`

export const Frame = styled.div`
  transition: opacity 0.15s ease;

  &[data-fetching] {
    opacity: 0.55;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`
