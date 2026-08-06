import styled from '@emotion/styled'
import { Icon } from '~/components/Icon'
import { theme } from '~/styles/theme'

export const Root = styled.div`
  min-height: 52vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 14px;
  color: ${theme.colors.softWhite};
`

export const Ico = styled(Icon)`
  opacity: 0.4;
`

export const Title = styled.h1`
  font-size: 24px;
`

export const Body = styled.p`
  margin: 0;
  color: ${theme.colors.gray4};
`
