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
  /* Dark-theme test: solid stand-in close to the translucent bar over the purple field. */
  background: #3c1358;
  z-index: 50;

  ${theme.media.maxWidth('mobile')} {
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

  /* Bar background (dark-theme test): translucent near-black over the purple field, per Figma. Like
     the sub-nav, it deepens once the page scrolls (body[data-scrolled], set by NavBar) so it doesn't
     wash out over light content passing underneath. */
  & nav::before {
    background: rgba(22, 21, 24, 0.4);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    box-shadow: none;
    transition: background 0.25s ease;
  }
  body[data-scrolled] & nav::before {
    background: rgba(22, 21, 24, 0.75);
  }

  /* Desktop nav tabs (Explore / Shop / Create / Learn): light text on the dark bar. Direct-child
     selectors deliberately exclude the dark dropdown panels that open on hover. */
  & nav > div:first-of-type > div > a,
  & nav > div:first-of-type > div > div > button {
    color: #ecebed;
  }
  & nav > div:first-of-type > div > a:hover,
  & nav > div:first-of-type > div > div > button:hover {
    color: ${theme.colors.white};
    background-color: rgba(255, 255, 255, 0.12);
  }
  & nav > div:first-of-type > div > a.active,
  & nav > div:first-of-type > div > div > button.active {
    color: ${theme.colors.white};
    background-color: rgba(255, 255, 255, 0.18);
  }

  /* Signed-in right cluster: the notifications bell is a glyph ui2 leaves near-black — force the
     cluster's buttons and any svg glyph to white so it reads on the dark bar. The profile pic is an
     <img> and the unread badge a text span, so neither is affected by color/fill. */
  & nav > div:last-of-type button {
    color: ${theme.colors.softWhite};
  }
  & nav > div:last-of-type svg {
    color: ${theme.colors.softWhite};
    fill: currentColor;
  }
  & nav > div:last-of-type svg path {
    fill: currentColor;
  }

  /* Sign-in button (signed-out state): light outline + text on the dark bar. The hamburger is
     excluded via :not([aria-label]). */
  & nav > div:last-of-type > button:not([aria-label]) {
    color: ${theme.colors.softWhite};
    border-color: ${theme.colors.softWhite};
  }
  & nav > div:last-of-type > button:not([aria-label]):hover {
    background-color: rgba(255, 255, 255, 0.12);
    border-color: ${theme.colors.softWhite};
  }
  & nav > div:last-of-type > button:not([aria-label]):active {
    background-color: rgba(255, 255, 255, 0.18);
    border-color: ${theme.colors.softWhite};
  }

  /* Balance chips (shop credits + Polygon MANA): ui2 styles them near-white for its dark bar, which
     is illegible on the light violet. The credits icon uses currentColor; the MANA diamond hardcodes
     a near-white fill, so its paths need the explicit override. Targeted via the chips' aria-labels
     ("<n> shop credits" / "<n> MANA on Polygon"), same contract as the hamburger below. */
  & nav button[aria-label$=' shop credits'],
  & nav button[aria-label*=' MANA on '] {
    color: ${theme.colors.text2};
  }
  & nav button[aria-label*=' MANA on '] svg path {
    fill: ${theme.colors.text2};
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
