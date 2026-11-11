import styled from '@emotion/styled'
import { theme } from '~/styles/theme'
import { Icon } from '~/components/Icon'

const { colors, media } = theme

export const Root = styled.span`
  position: absolute;
  top: 0;
  left: 0;
  z-index: 2;
  width: 74.34px;
  height: 76.33px;
  pointer-events: none;

  &[data-size='sm'] {
    width: 56.49px;
    height: 58px;
  }

  ${media.maxWidth('sm')} {
    width: 56.49px;
    height: 58px;
  }
`

export const Shape = styled.svg`
  display: block;
  width: 100%;
  height: 100%;
`

export const Glyph = styled(Icon)`
  position: absolute;
  top: 10.5px;
  left: 11px;
  width: 21px;
  height: 21px;
  color: ${colors.softWhite};

  [data-size='sm'] > & {
    top: 8px;
    left: 8.4px;
    width: 16px;
    height: 16px;
  }

  ${media.maxWidth('sm')} {
    top: 8px;
    left: 8.4px;
    width: 16px;
    height: 16px;
  }
`
