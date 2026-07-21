import styled from '@emotion/styled'
import { Icon } from '~/components/Icon'

export const Root = styled(Icon)`
  transition: transform 0.15s ease;

  &[data-up='true'] {
    transform: rotate(180deg);
  }
`
