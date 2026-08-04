import styled from '@emotion/styled'
import * as Row from '~/styles/row.styles'
import { theme } from '~/styles/theme'

// The outfits rail is the shared paged carousel (fixed N per view, dots), except phones show ONE
// look per page. Deliberately NOT `data-rail`: the Overview scopes an override on that attribute
// which would fight the one-per-view tier.
export const Track = styled(Row.CarouselTrack)`
  ${theme.media.maxWidth('mobile')} {
    grid-auto-columns: 100%;
    // The base track's hover-glow room (14px side padding + the re-aligning negative margin) left
    // the card 14px short on the RIGHT. Touch has no hover ring to reserve room for, so drop the
    // dance: the card is exactly the width the page gutter leaves.
    padding: 12px 0;
    margin-left: 0;
    scroll-padding-inline: 0;
  }
`
