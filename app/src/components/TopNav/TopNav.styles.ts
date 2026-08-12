import styled from '@emotion/styled'
import { theme } from '~/styles/theme'

// Holds the space of the lazy-loaded global DCL navbar (same height) so there's no layout shift; the
// fill matches the restyled navbar bar (see NavbarViolet below) so it doesn't flash when it hydrates.
export const Skeleton = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: var(--nav-h);
  /* Dark-theme test: solid stand-in for the bar's #161518 at 40% over the purple field. */
  background: #36184a;
  z-index: 50;
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
// Validated against decentraland-ui2@3.18.0 — re-check on upgrade (a wrapper div added/removed, or a
// localized aria-label, would silently drop these overrides).
export const NavbarViolet = styled.div`
  display: contents;

  /* Bar background (dark-theme test): translucent near-black (#161518 at 40%, per the designer) over
     the page field. It deepens to 80% once the page scrolls (body[data-scrolled], set by NavBar) so it
     doesn't wash out over light content passing underneath. The sub-nav below uses its own #401458 —
     the two bars are deliberately different colours. */
  & nav::before {
    background: rgba(22, 21, 24, 0.4);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    box-shadow: none;
    transition: background 0.25s ease;
  }
  body[data-scrolled] & nav::before {
    background: rgba(22, 21, 24, 0.8);
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
  }
  /* Only paths that are FILLED shapes. The credits mark draws its octagon as a stroke over
     fill="none", so filling every path turned the ring into a solid blob and swallowed the C. */
  & nav > div:last-of-type svg path:not([stroke]) {
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

  /* Balance chips (shop credits + Polygon MANA) read WHITE on the dark bar — they were forced dark
     back when this bar was light violet. The credits icon follows currentColor; the MANA diamond
     hardcodes its own fill, so its paths need the explicit override. Targeted via the chips'
     aria-labels ("<n> shop credits" / "<n> MANA on Polygon"), same contract as the hamburger below. */
  & nav button[aria-label$=' shop credits'],
  & nav button[aria-label*=' MANA on '] {
    color: ${theme.colors.softWhite};
  }
  & nav button[aria-label*=' MANA on '] svg path:not([stroke]) {
    fill: ${theme.colors.softWhite};
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

  /* Mobile bar (2116:430067). ui2 already gives it 64px at 12/16 padding, so only the fill, the spacing
     of the right cluster and the menu chip differ. */
  ${theme.media.maxWidth('mobile')} {
    & nav::before {
      background: rgba(22, 21, 24, 0.75);
    }

    /* 24px between bell, avatar and menu. ui2 splits that cluster in two nested flex rows (16 outer,
       12 inner at this width), so both have to carry it or the three end up unevenly spaced. */
    & nav > div:last-of-type,
    & nav > div:last-of-type > div {
      gap: 24px;
    }

    /* A translucent white chip, NOT the purple fill above: the mobile design draws it as glass on the
       bar (2116:429677). */
    & nav button[aria-label='Open menu'],
    & nav button[aria-label='Close menu'] {
      width: 40px;
      height: 40px;
      border-radius: 8px;
      background-color: rgba(255, 255, 255, 0.1);
      color: ${theme.colors.white};
    }
    & nav button[aria-label='Open menu']:hover,
    & nav button[aria-label='Close menu']:hover,
    & nav button[aria-label='Open menu']:active,
    & nav button[aria-label='Close menu']:active {
      background-color: rgba(255, 255, 255, 0.18);
    }
    & nav button[aria-label='Open menu'] svg,
    & nav button[aria-label='Close menu'] svg {
      width: 32px;
      height: 32px;
    }

    /* The avatar carries a half-white ring at this size (2116:429610). */
    & nav button[aria-label='User menu'] img {
      border: 2px solid rgba(255, 255, 255, 0.5);
      border-radius: 100px;
    }
  }

  /* Inside the iOS app's web view (?view=mobile-iap, Figma 2703:399357) the bar is chrome the app already
     provides: the app has its own menu and its own profile screen, so the shop's copies of them are either
     dead ends or a second way into somewhere the buyer is already standing. None of this is ui2's to
     configure — it takes no props for hiding the hamburger or for making the logo inert — so it is done
     here, against the same aria-label contract the rest of this file uses.
     ⚠️ Same caveat as above: validated against decentraland-ui2@3.19.0. */
  &[data-iap] {
    /* The app's own navigation replaces it. */
    & nav button[aria-label='Open menu'],
    & nav button[aria-label='Close menu'] {
      display: none;
    }

    /* Logo and avatar stay VISIBLE but stop being doorways — the logo would leave the shop for
       decentraland.org inside a web view with no way back, and the avatar opens a panel whose sign-out
       would strand the session the app owns. Pointer-events is the whole of what CSS can do here: both
       remain reachable by keyboard, which is a wart worth accepting over forking ui2 for a web view. */
    & nav a[aria-label='Decentraland Home'],
    & nav button[aria-label='User menu'] {
      pointer-events: none;
      cursor: default;
    }

    /* The balance is the one number this bar exists to carry here (the app sells the credits), so the
       mark reads at 20px instead of ui2's default. */
    & nav button[aria-label$=' shop credits'] svg {
      width: 20px;
      height: 20px;
    }
  }
`
