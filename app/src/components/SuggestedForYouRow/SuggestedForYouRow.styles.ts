import styled from '@emotion/styled'
import * as Row from '~/styles/row.styles'
import { theme } from '~/styles/theme'

export const Viewport = styled(Row.Viewport)``

export const Track = styled(Row.CarouselTrack)``

/** Tall enough for a card at its hovered height, so the rail does not grow when one is hovered. */
export const Cell = styled.div`
  display: flex;
  flex-direction: column;
  min-width: 0;
  height: 325px;

  ${theme.media.maxWidth('sm')} {
    height: auto;
  }
`

/** The icon's box. Its width is the design's per category (the star is drawn at 14, the rest at 16). */
export const ReasonIcon = styled.span`
  flex: 0 0 auto;
  width: 16px;
  height: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;

  &[data-category='creator'] {
    width: 14px;
    height: 14px;
  }
`

export const ReasonText = styled.span`
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;

  ${theme.media.maxWidth('sm')} {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }
`

/**
 * What the skeleton adds under its card: the height the note makes a real card grow by, so the rail
 * does not move when the cards arrive.
 */
export const ReasonPlaceholder = styled.div`
  height: 25px;

  ${theme.media.maxWidth('sm')} {
    height: 37px;
  }
`
