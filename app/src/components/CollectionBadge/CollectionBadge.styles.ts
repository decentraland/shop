import styled from '@emotion/styled'
import { theme } from '~/styles/theme'
import { Ava } from '~/components/CreatorBadge/badge.styles'

// 2×2 collage of collection thumbnails, reusing the round avatar slot. The line-strong background
// shows through the 1px gaps as hairline dividers between thumbnails. `styled(Ava)` so it keeps the
// shared avatar box (size/round/flex) while overriding the fill.
export const Collage = styled(Ava)`
  display: flex;
  flex-direction: column;
  overflow: hidden;
  gap: 1px;
  background: ${theme.colors.lineStrong};
`
