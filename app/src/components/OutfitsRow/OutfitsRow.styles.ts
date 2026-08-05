import styled from '@emotion/styled'
import * as Row from '~/styles/row.styles'
import { theme } from '~/styles/theme'

// The outfits rail is the shared paged carousel (fixed N per view, dots), except phones show ONE
// look per page. Deliberately NOT `data-rail`: the Overview scopes an override on that attribute
// which would fight the one-per-view tier.
// The cards carry 10% transparent headroom on top, so the visible card's middle sits at 55% of the
// rail — not 50%, which would leave the arrows reading high.
export const Viewport = styled(Row.Viewport)`
  --rail-arrow-top: 55%;
`

export const Track = styled(Row.CarouselTrack)`
  /* Figma (2090:402105) fits SIX looks per view on the wide layout, not the base rail's five. The
     lower tiers restate the base values — this appended block otherwise overrides them all. */
  grid-auto-columns: calc((100% - 80px) / 6);

  ${theme.media.maxWidth('xl')} {
    grid-auto-columns: calc((100% - 48px) / 4);
  }
  ${theme.media.maxWidth('lg')} {
    grid-auto-columns: calc((100% - 32px) / 3);
  }
  ${theme.media.maxWidth('sm')} {
    grid-auto-columns: calc((100% - 16px) / 2);
  }
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
