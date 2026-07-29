import styled from '@emotion/styled'
import { theme } from '~/styles/theme'

const { colors, media } = theme

// Shared browse layout: fixed 265px sidebar + fluid main column, used by Assets, Collection and
// Creator. On mobile the sidebar becomes an off-canvas bottom-sheet (Assets toggles it open via
// `data-open` + a Filters button; the other pages simply leave it closed).
export const Browse = styled.div`
  position: relative;
  display: flex;
  gap: 32px;
  align-items: flex-start;

  ${media.maxWidth('lg')} {
    display: block;
  }
`

export const Main = styled.div`
  flex: 1;
  min-width: 0;

  ${media.maxWidth('lg')} {
    width: 100%;
  }
`

// data-open slides the mobile drawer up.
export const Sidebar = styled.aside`
  flex: none;
  width: 265px;

  ${media.maxWidth('lg')} {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    top: auto;
    z-index: 9999;
    width: 100%;
    max-height: 88vh;
    border-radius: 16px 16px 0 0;
    background: ${colors.white};
    padding: 0 16px;
    overflow-y: auto;
    box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.18);
    transform: translateY(100%);
    transition: transform 0.26s ease;
    visibility: hidden;

    &[data-open] {
      transform: translateY(0);
      visibility: visible;
    }
  }
`
