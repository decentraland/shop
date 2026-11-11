import styled from '@emotion/styled'

/**
 * The full-viewport, non-interactive sheet one layer of snow is drawn on.
 *
 * The back layer sits at `-1`, behind the page's content like the drifting tile and the bats: it paints over
 * the page field and is seen only through the gaps. The front layer sits where the spider hangs, over the
 * content but under the nav, so no flake ever crosses a tab label or the search field.
 */
export const Canvas = styled.canvas`
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100vh;
  pointer-events: none;
  z-index: -1;

  &[data-depth='front'] {
    z-index: 35;
  }
`
