import type { Plugin } from 'vite'
import { HOME_PATHS } from '../src/lib/homePath'

// The home hero is the LCP element of the Shop's most visited page, and the preload scanner cannot see
// it: the <img> exists only once the entry chunk has run, so on production the request left at 264ms
// (desktop) / 350ms (mobile), of which 244 / 331 was pure discovery delay. This puts the preload in the
// HTML instead.
//
// Emitted as a script rather than two <link> tags because ONE index.html serves every route. Static links
// preload the home hero on /items, /cart and /credits too — 55 KB of image those pages never render,
// at high priority, competing with the content they do. The script runs at parse time, before the entry
// module, so a Home entry still gets the early discovery; every other route gets nothing. (It is inline,
// which the served CSP allows via 'unsafe-inline' in script-src — the same way the site's own edge worker
// injects script there.)
//
// `matchMedia` rather than a `media` attribute per link, because it is the SAME query the <picture> in
// Overview.tsx switches on: one expression, evaluated once, so the two cannot describe different
// breakpoints or leave a fractional viewport matching neither. The path test comes from `lib/homePath`,
// which mirrors the routes declared in App.tsx and is unit-tested there rather than spelled out here.
//
// POSITION IS LOAD-BEARING: the script is anchored immediately after `<meta name="viewport">`, not at the
// top of <head>. A phone's layout viewport is ~980px until that meta is parsed, so a bootstrap running
// before it asks `(max-width: 768px)` while `innerWidth` still reads 980, gets `false`, and preloads the
// WIDE art — which the page then replaces with the phone composition, downloading both. Anchored here it
// reads the real width, and it is still ahead of every script and stylesheet the document loads.
//
// A running CAMPAIGN replaces the hero art from the CMS, and this still preloads the bundled default.
// That is correct rather than wasteful: the campaign is resolved by two chained async reads (a feature
// flag, then Contentful), so the default is what the page renders first in every case, campaign or not.
const PRELOADED_HERO = {
  desktop: 'src/assets/overview/hero-credits-outfits.webp',
  mobile: 'src/assets/overview/hero-credits-mobile.webp'
}

export function preloadHero(base: string): Plugin {
  return {
    name: 'preload-hero',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(_html: string, ctx) {
        const href = (source: string) => {
          const emitted = Object.values(ctx.bundle ?? {}).find(
            output => output.type === 'asset' && (output.originalFileNames ?? []).some(name => name.endsWith(source))
          )
          // Throw rather than skip. A renamed or deleted hero asset would otherwise drop the preload in
          // silence, and the only symptom would be a slower LCP noticed in some Lighthouse run weeks later.
          if (!emitted) throw new Error(`preload-hero: ${source} is not in the bundle — was it renamed?`)
          return `${base}${emitted.fileName}`
        }
        const script =
          `(function(){var p=location.pathname.replace(/\\/+$/,"");` +
          `if(${JSON.stringify(HOME_PATHS)}.indexOf(p)<0)return;` +
          `var l=document.createElement("link");l.rel="preload";l.as="image";` +
          `l.setAttribute("fetchpriority","high");` +
          `l.href=matchMedia("(max-width: 768px)").matches?${JSON.stringify(href(PRELOADED_HERO.mobile))}:${JSON.stringify(href(PRELOADED_HERO.desktop))};` +
          `document.head.appendChild(l)})()`
        // Anchored by replacement rather than injected: `head-prepend` puts it before the viewport meta
        // and `head` puts it at the end, past tags this wants to precede. Throws when the anchor is gone,
        // for the same reason the asset lookup does — a silently misplaced bootstrap still "works", it
        // just quietly preloads the wrong image on every phone.
        const viewport = /<meta[^>]+name="viewport"[^>]*>/
        if (!viewport.test(_html)) {
          throw new Error('preload-hero: no <meta name="viewport"> in index.html to anchor the bootstrap to')
        }
        return _html.replace(viewport, match => `${match}\n    <script>${script}</script>`)
      }
    }
  }
}
