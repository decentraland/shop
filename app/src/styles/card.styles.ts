import { css } from '@emotion/react'
import { theme } from '~/styles/theme'

const { colors, gradients } = theme

export const ringHairline = css`
  content: '';
  position: absolute;
  inset: 0;
  z-index: 5;
  pointer-events: none;
  border: 0.5px solid ${colors.lineStrong};
  border-radius: inherit;
`

export const ringLit = css`
  box-shadow: 0 0 8px 0 ${colors.brandViolet};
  outline: none;
`

export const ringGradient = css`
  border: 0;
  padding: 2px;
  background: ${gradients.cerise};
  -webkit-mask:
    linear-gradient(#000 0 0) content-box,
    linear-gradient(#000 0 0);
  mask:
    linear-gradient(#000 0 0) content-box,
    linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
`
