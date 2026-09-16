import styled from '@emotion/styled'
import { theme } from '~/styles/theme'

// The discount tag (Figma node 3322:220807): a pink chip with a red hairline, a flame, and the cut in
// bold. One component because it now rides two surfaces — the card's artwork and the item page's price
// block — and two copies of it drifted apart the moment the design changed.

export const Root = styled.span`
  display: inline-flex;
  /* Hugs its content: as a block-level child of a column it stretched the full width of the page. */
  align-self: flex-start;
  align-items: center;
  gap: 4px;
  padding: 4px;
  border-radius: 4px;
  /*
   * A gradient hairline, which a plain border-color cannot draw. Two backgrounds do it: the fill clipped
   * to the padding box, the gradient to the border box, with a transparent border letting the second show
   * through only in the 0.5px the first does not cover. border-image is the other way round and it cannot
   * follow a border-radius.
   */
  background:
    linear-gradient(${theme.colors.saleTag}, ${theme.colors.saleTag}) padding-box,
    ${theme.gradients.flare} border-box;
  border: 0.5px solid transparent;
  color: ${theme.colors.text};
  font-family: ${theme.font.sans};
  font-weight: 400;
  white-space: nowrap;

  /* Two sizes, one component: 12px on a card (node 3322:220807), 20px on the item page (node 3326:228292).
     Everything else — fill, hairline, radius, padding, gap — is identical between the two. */
  font-size: 12px;
  line-height: 12px;
  &[data-size='lg'] {
    font-size: 20px;
    line-height: 20px;
  }
`

/** The number the tag is about, in the design's own red. */
export const Pct = styled.b`
  font-weight: 700;
  color: ${theme.colors.saleTagInk};
`
