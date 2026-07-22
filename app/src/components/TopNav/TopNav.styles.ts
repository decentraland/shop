import styled from '@emotion/styled'
import { theme } from '~/styles/theme'

// Holds the space of the lazy-loaded global DCL navbar (same height) so there's no layout shift; the
// violet fill matches the restyled navbar bar (see NavbarViolet below) so it doesn't flash when it
// hydrates.
export const Skeleton = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 92px;
  background: ${theme.colors.navViolet};
  z-index: 50;

  ${theme.media.down('mobile')} {
    height: 64px;
  }
`

// Restyles the shared decentraland-ui2 Navbar to the violet Figma design (nodes 1368-354066 desktop /
// 1368-356253 mobile) from the shop side. ui2 hardcodes the navbar's colors in its own Emotion
// styled-components with no theme hook, and the DCL preference is to override in the consumer rather
// than fork ui2. Selectors target the navbar's stable rendering contract — semantic tags, the logo /
// hamburger aria-labels, and the `.active` tab class — since ui2's Emotion class names are hashed and
// not stable. `display: contents` keeps this wrapper from generating a box (the navbar itself is
// position: fixed). Specificity (wrapper class + element/attribute) beats ui2's single-class rules,
// so no !important is needed.
//
// ⚠️ These structural selectors (`nav > div:first-of-type > …`) depend on decentraland-ui2's internal
// DOM nesting, and the hamburger selectors on its English `aria-label`s ("Open menu" / "Close menu").
// Validated against decentraland-ui2@3.13.1 — re-check on upgrade (a wrapper div added/removed, or a
// localized aria-label, would silently drop these overrides).
export const NavbarViolet = styled.div`
  display: contents;

  /* Bar background: flat light violet — drop ui2's dark translucent fill, blur and shadow. */
  & nav::before {
    background: ${theme.colors.navViolet};
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    box-shadow: none;
  }

  /* Desktop nav tabs (Explore / Shop / Create / Learn): dark text on the light bar. Direct-child
     selectors deliberately exclude the dark dropdown panels that open on hover. */
  & nav > div:first-of-type > div > a,
  & nav > div:first-of-type > div > div > button {
    color: ${theme.colors.text2};
  }
  & nav > div:first-of-type > div > a:hover,
  & nav > div:first-of-type > div > div > button:hover {
    color: ${theme.colors.text2};
    background-color: ${theme.colors.navOverlayHover};
  }
  & nav > div:first-of-type > div > a.active,
  & nav > div:first-of-type > div > div > button.active {
    color: ${theme.colors.text2};
    background-color: ${theme.colors.navOverlayActive};
  }

  /* Sign-in button (signed-out state): dark outline + text instead of ui2's near-white, which would
     be invisible on the violet bar. The hamburger is excluded via :not([aria-label]). */
  & nav > div:last-of-type > button:not([aria-label]) {
    color: ${theme.colors.text2};
    border-color: ${theme.colors.text2};
  }
  & nav > div:last-of-type > button:not([aria-label]):hover {
    background-color: ${theme.colors.navOverlayHover};
    border-color: ${theme.colors.text2};
  }
  & nav > div:last-of-type > button:not([aria-label]):active {
    background-color: ${theme.colors.navOverlayActive};
    border-color: ${theme.colors.text2};
  }

  /* Mobile hamburger / menu button: solid purple with a white icon (Figma node 1368-356253) — ui2's
     default is a faint white-on-dark chip. The icon uses currentColor, so the color prop drives it. */
  & nav button[aria-label='Open menu'],
  & nav button[aria-label='Close menu'] {
    background-color: ${theme.colors.accent};
    color: ${theme.colors.white};
  }
  & nav button[aria-label='Open menu']:hover,
  & nav button[aria-label='Close menu']:hover {
    background-color: ${theme.colors.accentHover};
  }
  & nav button[aria-label='Open menu']:active,
  & nav button[aria-label='Close menu']:active {
    background-color: ${theme.colors.accentActive};
  }
`
