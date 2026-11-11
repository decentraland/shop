import styled from '@emotion/styled'
import { theme } from '~/styles/theme'

export {
  Accent,
  Actions,
  Body,
  Cta,
  Dismiss,
  Root,
  Text
} from '~/components/ManaPricingBanner/ManaPricingBanner.styles'

const { colors, media } = theme

export const LearnMore = styled.a`
  font-weight: 600;
  color: ${colors.text};
  text-decoration: underline;
  white-space: nowrap;

  &:hover {
    color: ${colors.gray0};
  }
  &:focus-visible {
    outline: 2px solid ${colors.text};
    outline-offset: 2px;
  }
`

// Same gutter and max width as `.page`, so the strip lines up with the content under it.
export const Frame = styled.div`
  max-width: 1760px;
  margin: 0 auto;
  width: 100%;
  padding: 16px 54px 0;

  /* These routes drop the page's top padding for a full-bleed hero, so the strip brings its own gap. */
  &[data-route='/overview'],
  &[data-route='/event'] {
    padding-bottom: 16px;
  }

  ${media.maxWidth('mobile')} {
    padding: 12px 16px 0;

    &[data-route='/event'] {
      padding-bottom: 12px;
    }

    /* The overview hero pulls itself 16px up on mobile, which would eat the gap and overlap the strip. */
    &[data-route='/overview'] {
      padding-bottom: 28px;
    }
  }
`
