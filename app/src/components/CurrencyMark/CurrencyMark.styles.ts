import styled from '@emotion/styled'

export const Mark = styled.span`
  display: inline-flex;
  align-items: center;
  cursor: help;
  /* The glyph sits tight against its own box, so the figure beside it needs the gap from here. */
  margin-right: 3px;

  img {
    width: 1em;
    height: 1em;
    vertical-align: -0.125em;
  }
`
