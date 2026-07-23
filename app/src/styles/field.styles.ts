import styled from '@emotion/styled'
import { theme } from '~/styles/theme'

const { colors } = theme

// A form field (label + control). Render as a <label> via `as="label"` when wrapping an input.
export const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 14px;

  & input {
    background: #fff;
    border: 1px solid ${colors.lineStrong};
    border-radius: 8px;
    padding: 10px 12px;
    color: ${colors.text};
    font: inherit;
  }
`
