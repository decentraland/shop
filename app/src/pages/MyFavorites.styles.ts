import styled from '@emotion/styled'
import { theme } from '~/styles/theme'
import { Button } from '~/components/Button'

const { colors } = theme

export const Head = styled.div`
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 20px;
`

export const Count = styled.span`
  color: ${colors.muted};
  font-size: 14px;
`

export const Empty = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  text-align: center;
  padding: 90px 20px;
  min-height: 50vh;
`

export const EmptyTitle = styled.p`
  font-size: 22px;
  font-weight: 700;
  margin: 6px 0 0;
`

export const EmptyCta = styled(Button)`
  margin-top: 12px;
`
