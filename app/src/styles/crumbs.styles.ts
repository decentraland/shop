import { css } from '@emotion/react'
import { theme } from '~/styles/theme'

/* Pins a breadcrumb row to the viewport gutter (the sub-nav's fixed 54px/16px padding) instead of the
   centered page column, so the trail stays aligned with the OVERVIEW tab once the shell hits its
   max-width. Full-bleed the same way the overview hero is (100vw is guarded by html's overflow-x: clip). */
export const crumbGutter = css`
  width: 100vw;
  margin-left: calc(-50vw + 50%);
  padding: 0 54px;

  ${theme.media.maxWidth('mobile')} {
    padding: 0 16px;
  }
`
