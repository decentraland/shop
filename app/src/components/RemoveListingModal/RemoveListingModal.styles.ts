import styled from '@emotion/styled'
import { theme } from '~/styles/theme'
import { Button } from '~/components/Button'
import * as M from '~/styles/modal.styles'

// Wide enough that the two footer labels stay on one line; stacked where the width isn't there.
export const Card = styled(M.Modal)`
  width: min(500px, 92vw);
  gap: 20px;

  ${theme.media.maxWidth('mobile')} {
    [data-actions] {
      flex-direction: column-reverse;
    }
    [data-actions] > * {
      width: 100%;
    }
  }
`

// Flat purple, like the form modals' submit — not the gradient primary.
export const Submit = styled(Button)`
  background: ${theme.colors.accent};
  color: ${theme.colors.white};
  text-transform: uppercase;
  letter-spacing: 0.046em;
  font-size: 13px;

  &:hover:not(:disabled) {
    background: ${theme.colors.accentHover};
  }
`
