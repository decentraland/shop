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

  ${theme.media.maxWidth('lg')} {
    display: block;
  }
`

export const Main = styled.div`
  flex: 1;
  min-width: 0;

  ${theme.media.maxWidth('lg')} {
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
  ${theme.media.minWidth('lg')} {
    position: sticky;
    /* Sit flush below the fixed ui2 navbar (92px) + the sticky shop sub-nav (66px = its height) so the
       sidebar tracks scroll without hiding under them or floating in a gap (see index.css). */
    top: 158px;
    /* Scroll inside the column when the expanded filters exceed the viewport; the 24px keeps the last
       control clear of the screen edge. */
    max-height: calc(100vh - 158px - 24px);
    overflow-y: auto;
    overscroll-behavior: contain;
    /* Scrollbar fully hidden (it used to fade in on hover, which read as a glitch on the dark theme).
       Wheel/trackpad/keyboard scrolling still works; the column just never shows a bar. */
    scrollbar-width: none;
    -ms-overflow-style: none;
    &::-webkit-scrollbar {
      width: 0;
      display: none;
    }
  }

  ${theme.media.maxWidth('lg')} {
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
    background: #2b0e44;
    padding: 0 16px;
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

// The scrollable region of the mobile sheet (title + filters). On desktop it's just the static list.
export const SidebarScroll = styled.div`
  ${theme.media.maxWidth('lg')} {
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

  ${theme.media.maxWidth('lg')} {
    position: sticky;
    top: 0;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: #2b0e44;
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
  color: ${theme.colors.softWhite};
`

export const CloseBtn = styled.button`
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.16);
  border: 0;
  font-size: 15px;
  line-height: 1;
  cursor: pointer;
  color: ${theme.colors.softWhite};

  &:focus-visible {
    outline: 2px solid ${theme.colors.accent};
    outline-offset: 2px;
  }
`

// Bottom action bar (mobile only): a single full-width "Show items" button (Figma node 1304-308322).
// Sticky (NOT fixed) so it pins to the bottom of the scrollport rather than the transformed sheet.
export const DrawerFoot = styled.div`
  display: none;

  ${theme.media.maxWidth('lg')} {
    display: flex;
    align-items: center;
    gap: 12px;
    position: sticky;
    bottom: 0;
    margin: 8px -16px 0;
    padding: 16px 16px calc(16px + env(safe-area-inset-bottom));
    background: #2b0e44;
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

// Notice above the grid when the MANA oracle is down, so market-priced (legacy) cards can't be bought.
// data-variant='warn' is the red treatment.
export const MarketBanner = styled.p`
  display: flex;
  align-items: center;
  gap: 10px;
  background: ${theme.colors.rarityBg};
  color: ${theme.colors.accent};
  border-radius: 12px;
  padding: 12px 16px;
  margin-bottom: 14px;
  font-weight: 600;
  font-size: 14px;

  &[data-variant='warn'] {
    background: rgba(211, 51, 51, 0.1);
    color: ${theme.colors.err};
  }
`

// Zero-results state for the grid (search/filters returned nothing) — a white rounded card centering
// an illustration, the "Oops!" copy and an Explore Shop CTA.
// Figma "EMpty states" (2103:412914): a translucent-black panel over the purple field, not a white
// card — the page has no light surfaces, so a white block here read as a hole in the layout.
export const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 24px;
  padding: 48px 16px;
  border-radius: 16px;
  background: rgba(0, 0, 0, 0.2);
  text-align: center;
`

export const EmptyIcon = styled.img`
  width: 101px;
  height: 101px;
`

export const EmptyText = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding-bottom: 16px;
  color: ${theme.colors.softWhite};
`

export const EmptyTitle = styled.p`
  margin: 0;
  font-family: ${theme.font.sans};
  font-weight: 700;
  font-size: 20px;
  line-height: 1.6;
`

export const EmptyBody = styled.p`
  margin: 0;
  max-width: 520px;
  font-family: ${theme.font.sans};
  font-weight: 400;
  font-size: 16px;
  line-height: 1.6;

  b {
    font-weight: 600;
  }
`

export const EmptyCta = styled.div`
  display: flex;
  flex-direction: column;
  width: 310px;
  max-width: 100%;
  padding-bottom: 16px;
`

export const EmptyBtn = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  height: 52px;
  padding: 0 12px;
  border: 0;
  border-radius: 12px;
  /* The design's own CTA here is a deeper translucent black on the panel, not a solid purple. */
  background: rgba(0, 0, 0, 0.4);
  color: ${theme.colors.softWhite};
  font-family: ${theme.font.sans};
  font-weight: 600;
  font-size: 15px;
  line-height: 24px;
  letter-spacing: 0.46px;
  text-transform: uppercase;
  cursor: pointer;

  &:hover {
    background: rgba(0, 0, 0, 0.55);
  }
  &:active {
    background: rgba(0, 0, 0, 0.65);
  }
  &:focus-visible {
    outline: 2px solid ${theme.colors.softWhite};
    outline-offset: 2px;
  }
`
