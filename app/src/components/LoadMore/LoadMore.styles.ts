import styled from '@emotion/styled'
import { Button } from '~/components/Button'

// Infinite-scroll "load more" trigger (sentinel + fallback button), centered under a grid.
export const Root = styled.div`
  display: flex;
  justify-content: center;
  padding: 28px 0 8px;
`

export const Trigger = styled(Button)`
  min-width: 160px;
`
