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
 * The line of plain language under each card.
 *
 * Height is RESERVED for the full two lines at every width, whether or not a given reason needs them,
 * because the cards sit in one row: letting the box grow with its text would leave every card in the
 * rail a different height depending on how long its creator's name happens to be.
 *
 * One line on desktop, where the cards are wide enough for any of the six reasons. On a phone two
 * cards share the viewport and every reason was being cut mid-word ("Because you have Galaxy …"), so
 * the clamp opens to two lines there. Past that it still truncates, and the whole text stays
 * available through the title attribute.
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
  height: 32px;

  ${theme.media.maxWidth('mobile')} {
    font-size: 11px;
    line-height: 15px;
    height: 30px;
    white-space: normal;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
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
