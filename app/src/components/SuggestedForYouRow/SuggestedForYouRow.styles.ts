import styled from '@emotion/styled'
import { Link } from 'react-router-dom'
import * as Row from '~/styles/row.styles'
import { theme } from '~/styles/theme'

export const Viewport = styled(Row.Viewport)``

export const Track = styled(Row.CarouselTrack)``

/** The card plus the line that explains why it is here. The explanation belongs to the card, not to
 * the rail, so it scrolls and pages with it. */
export const Cell = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
`

/**
 * One line of plain language under each card. Clamped to a single line because the rail's cards are
 * a fixed height and a creator name long enough to wrap would push one card taller than its
 * neighbours; the full text stays available as the title attribute.
 */
export const Reason = styled.p`
  margin: 0;
  padding: 0 2px;
  font-size: 12px;
  line-height: 16px;
  /* Gray 5 as ink, not Gray 2: this line sits straight on the purple page field, where the mid-greys
     drop under the AA ratio against the gradient's lightest stop (see theme.colors.gray5). */
  color: ${theme.colors.gray5};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  ${theme.media.maxWidth('mobile')} {
    font-size: 11px;
  }
`

export const ReasonLink = styled(Link)`
  color: inherit;
  text-decoration: underline;
  text-underline-offset: 2px;

  &:hover,
  &:focus-visible {
    color: ${theme.colors.softWhite};
  }
`
