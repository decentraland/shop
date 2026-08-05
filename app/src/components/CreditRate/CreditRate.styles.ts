import styled from '@emotion/styled'
import { theme } from '~/styles/theme'

const { colors, font } = theme

export const Root = styled.p`
  display: flex;
  align-items: center;
  gap: 4px;
  margin: 0;
  font-family: ${font.sans};
  font-size: 16px;
  line-height: normal;
  color: ${colors.text};

  &[data-align='center'] {
    justify-content: center;
  }

  /* The peg is stated on a white modal AND on the violet migration page, so the line carries the two
     skins the design gives it. On dark the whole line is white — the "=" loses its grey step, which
     would read as struck-through type against the page. */
  &[data-tone='on-dark'] {
    color: ${colors.white};
  }
`

// The numerals carry the weight; the unit and currency labels stay regular.
export const Value = styled.span`
  font-weight: 600;
`

export const Unit = styled.span`
  font-weight: 400;
`

export const Equals = styled.span`
  font-size: 14px;
  font-weight: 600;
  line-height: 1.57;
  color: ${colors.muted1};

  [data-tone='on-dark'] & {
    color: inherit;
  }
`
