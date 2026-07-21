import styled from '@emotion/styled'
import { theme } from '~/styles/theme'

// Holds the space of the lazy-loaded global DCL navbar (same height) so there's no layout shift; the
// dark fill matches the real decentraland-ui2 navbar so it doesn't flash when it hydrates. That fill
// is the third-party navbar's own color, not a shop palette token, so it stays a literal here.
export const Skeleton = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 92px;
  background: #16141a;
  z-index: 50;

  ${theme.media.down('mobile')} {
    height: 64px;
  }
`
