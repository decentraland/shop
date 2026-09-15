import styled from '@emotion/styled'
import { theme } from '~/styles/theme'

export const Bar = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
  width: 100%;
  max-width: 456px;
`

export const Count = styled.span`
  flex: none;
  font-family: ${theme.font.sans};
  font-size: 18px;
  color: ${theme.colors.muted};
`

export const Hint = styled.p`
  margin: 0;
  font-family: ${theme.font.sans};
  font-size: 13px;
  line-height: 1.5;
  color: ${theme.colors.muted};
  text-align: center;
`

export const Relay = styled.p`
  margin: 0;
  font-family: ${theme.font.sans};
  font-size: 13px;
  line-height: 1.5;
  color: ${theme.colors.text};
`
