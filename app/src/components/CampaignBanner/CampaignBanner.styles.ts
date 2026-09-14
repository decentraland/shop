import styled from '@emotion/styled'
import { breakpoints, theme } from '~/styles/theme'

/**
 * The box around ui2's `<Banner>`.
 *
 * The banner is Contentful artwork painted as a background by a component we do not own, and its emotion
 * class names are hashed, so its parts can only be sized from the outside. What matters here is the
 * WIDTH CAP: the desktop artwork is authored at 1280px and ui2 stretches it across whatever container it
 * is given, so on a wide monitor an uncapped banner is upscaled past 2x — soft, and taller than half the
 * viewport. Capping the inner box caps the height with it.
 */
export const Shell = styled.section`
  width: 100%;
  margin: 0 0 32px;

  > div {
    max-width: ${breakpoints.xl}px;
    margin-inline: auto;
    border-radius: ${theme.radius.banner};
    overflow: hidden;
  }

  ${theme.media.maxWidth('mobile')} {
    margin-bottom: 20px;

    /* Edge to edge on a phone: the artwork is a different composition at this size (ui2 swaps to the
       mobile background asset), and a rounded inset card makes it read as a widget rather than a header. */
    > div {
      border-radius: 0;
    }
  }
`
