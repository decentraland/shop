import styled from '@emotion/styled'
import { theme } from '~/styles/theme'

// Assets browse layout: a 265px filter sidebar + the main column (toolbar + grid). On desktop the
// sidebar is sticky (pinned below the navbar + sub-nav) and scrolls internally when its sections
// overflow the viewport, so it accompanies the grid's scroll. Below the `lg` breakpoint the sidebar
// becomes an off-canvas bottom-sheet Filters drawer (Figma mobile sheet 1304-307965) opened by the
// toolbar's Filters pill; the grid then takes the full width. MyAssets reuses this same shell.

export const Root = styled.div`
  position: relative;
  display: flex;
  gap: 32px;
  align-items: flex-start;

  ${theme.media.down('lg')} {
    display: block;
  }
`

export const Main = styled.div`
  flex: 1;
  min-width: 0;

  ${theme.media.down('lg')} {
    width: 100%;
  }
`

export const Sidebar = styled.aside`
  flex: none;
  width: 265px;

  /* Desktop only (mobile is the off-canvas drawer below). Pin the filter column so it accompanies the
     grid's scroll, and let it scroll internally when every section is expanded instead of overflowing
     the page. The row's align-items: flex-start (Root) keeps this a content-height item, which is what
     makes sticky able to move within the row. */
  ${theme.media.up('lg')} {
    position: sticky;
    /* Sit flush below the fixed ui2 navbar (92px) + the sticky shop sub-nav (66px = its height) so the
       sidebar tracks scroll without hiding under them or floating in a gap (see index.css). */
    top: 158px;
    /* Scroll inside the column when the expanded filters exceed the viewport; the 24px keeps the last
       control clear of the screen edge. */
    max-height: calc(100vh - 158px - 24px);
    overflow-y: auto;
    overscroll-behavior: contain;
    /* Reserve the scrollbar gutter so revealing the bar on hover doesn't shift the filter content. */
    scrollbar-gutter: stable;

    /* Subtle scrollbar (matches the cart scroll list). The track width is reserved CONSTANTLY — the same
       8px at rest and on hover — so revealing the scrollbar never consumes space and pushes the sidebar
       content left. Only the THUMB fades in on hover; at rest both thumb and track are transparent, so
       the gutter is invisible but its space is already held. Firefox keeps scrollbar-width: thin (not
       none -> thin, which would also shift) and just recolours the thumb on hover. */
    scrollbar-width: thin;
    scrollbar-color: transparent transparent;
    &::-webkit-scrollbar {
      width: 8px;
    }
    &::-webkit-scrollbar-track {
      background: transparent;
    }
    &::-webkit-scrollbar-thumb {
      background: transparent;
      border-radius: 8px;
      transition: background 0.2s ease;
    }
    &:hover {
      scrollbar-color: ${theme.colors.muted2} transparent;
    }
    &:hover::-webkit-scrollbar-thumb {
      background: ${theme.colors.muted2};
    }
  }

  ${theme.media.down('lg')} {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    top: auto;
    z-index: 9999;
    width: 100%;
    max-height: 88vh;
    display: flex;
    flex-direction: column;
    border-radius: 16px 16px 0 0;
    background: ${theme.colors.white};
    padding: 0 16px;
    box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.18);
    transform: translateY(100%);
    transition: transform 0.26s ease;
    visibility: hidden;

    &.is-open {
      transform: translateY(0);
      visibility: visible;
    }
  }
`

// The scrollable region of the mobile sheet (title + filters). On desktop it's just the static list.
export const SidebarScroll = styled.div`
  ${theme.media.down('lg')} {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    /* Room so the last filter row clears the sticky "Show items" bar (Figma bottom bar). */
    padding-bottom: 24px;
  }
`

export const Scrim = styled.div`
  position: fixed;
  inset: 0;
  z-index: 9998;
  background: rgba(0, 0, 0, 0.4);
`

// Drawer chrome (mobile only): "FILTERS" title + a close ✕ inside a gray-5 circle. Sticky so it stays
// pinned while the sheet scrolls.
export const DrawerHead = styled.div`
  display: none;

  ${theme.media.down('lg')} {
    position: sticky;
    top: 0;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: ${theme.colors.white};
    margin: 0 -16px 8px;
    padding: 16px 16px 12px;
    border-radius: 16px 16px 0 0;
  }
`

export const DrawerTitle = styled.span`
  font-family: ${theme.font.sans};
  font-weight: 700;
  font-size: 15px;
  letter-spacing: 0.46px;
  text-transform: uppercase;
  color: ${theme.colors.text};
`

export const CloseBtn = styled.button`
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: ${theme.colors.chip};
  border: 0;
  font-size: 15px;
  line-height: 1;
  cursor: pointer;
  color: ${theme.colors.text};

  &:focus-visible {
    outline: 2px solid ${theme.colors.accent};
    outline-offset: 2px;
  }
`

// Bottom action bar (mobile only): a single full-width "Show items" button (Figma node 1304-308322).
// Sticky (NOT fixed) so it pins to the bottom of the scrollport rather than the transformed sheet.
export const DrawerFoot = styled.div`
  display: none;

  ${theme.media.down('lg')} {
    display: flex;
    align-items: center;
    gap: 12px;
    position: sticky;
    bottom: 0;
    margin: 8px -16px 0;
    padding: 16px 16px calc(16px + env(safe-area-inset-bottom));
    background: ${theme.colors.white};
    box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.25);
    z-index: 1;
  }
`

export const ShowItems = styled.button`
  flex: 1;
  height: 40px;
  border: 0;
  border-radius: 8px;
  background: ${theme.colors.accent};
  color: ${theme.colors.softWhite};
  font-family: ${theme.font.sans};
  font-weight: 600;
  font-size: 13px;
  letter-spacing: 0.46px;
  line-height: 24px;
  text-transform: uppercase;
  cursor: pointer;

  &:hover {
    filter: brightness(1.08);
  }
  &:focus-visible {
    outline: 2px solid ${theme.colors.accent};
    outline-offset: 2px;
  }
`
