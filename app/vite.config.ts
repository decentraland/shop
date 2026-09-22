import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import { sentryVitePlugin } from '@sentry/vite-plugin'
import { fileURLToPath, URL } from 'node:url'
import { readFileSync, writeFileSync } from 'node:fs'

// Build/dev config. Points at a LOCAL marketplace-server by default (see .env / config.ts).
// DCL libs (connect/dapps/crypto) need Node globals (Buffer/global/process) in the browser.
// Test config lives in vitest.config.ts.

const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf8'))

// DCL sites are served from the versioned CDN path (cdn.decentraland.org/<name>/<version>/), so the
// deploy build must reference assets there. Gated on DEPLOY_CDN (set only by the deploy workflows) so
// local dev + the e2e dev server + the CI build-check keep serving from the root.
const base = process.env.DEPLOY_CDN === 'true' ? `https://cdn.decentraland.org/${pkg.name}/${pkg.version}/` : '/'

// Upload source maps to Sentry only when an auth token is present (release builds). Local dev + the
// CI build-check have no token → no maps emitted, build behaves exactly as before.
const sentryUpload = Boolean(process.env.SENTRY_AUTH_TOKEN)

/**
 * The ONE release identifier, used by the source-map upload AND baked into the bundle for the runtime.
 *
 * Sentry matches an uploaded source map to an incoming event by release name — if the name the plugin
 * uploaded under and the name the browser reports are not the same string, no map is ever applied. They
 * were not: the plugin uploaded `shop@<pkg.version>` while the app read `import.meta.env.VITE_APP_VERSION`,
 * a variable no build ever sets, and fell back to `0.0.0-dev`. Every production event was therefore
 * stamped `shop@0.0.0-dev` and every stack trace stayed minified (`ds`, `XP`, `_a`).
 *
 * Deriving both from this single const is what makes the two unable to drift again.
 */
const sentryRelease = process.env.VITE_SENTRY_RELEASE ?? `shop@${pkg.version}`

// The home hero is the LCP element of the Shop's most visited page, and the preload scanner cannot see
// it: the <img> exists only once the entry chunk has run, so on production the request left at 314ms of
// which 272ms was pure discovery delay. This emits the preload into the HTML instead.
//
// Generated rather than hand-written in index.html because the file name carries a content hash — a
// hardcoded href would not fail, it would quietly download a second, stale image forever. `media` mirrors
// the <picture> in Overview.tsx so exactly one of the two is ever fetched; keep the pairs in step.
//
// A running CAMPAIGN replaces the hero art from the CMS, and this still preloads the bundled default.
// That is correct rather than wasteful: the campaign is resolved by two chained async reads (a feature
// flag, then Contentful), so the default is what the page renders first in every case, campaign or not.
// The desktop entry is the EXACT complement of the <source>'s own query rather than `(min-width: 769px)`:
// a fractional viewport (browser zoom lands there) between 768 and 769 matches neither, so the page would
// show the wide art with nothing preloaded for it.
const PRELOADED_HERO = [
  { source: 'src/assets/overview/hero-credits-outfits.webp', media: 'not all and (max-width: 768px)' },
  { source: 'src/assets/overview/hero-credits-mobile.webp', media: '(max-width: 768px)' }
]

function preloadHero(): Plugin {
  return {
    name: 'preload-hero',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        return PRELOADED_HERO.map(hero => {
          const emitted = Object.values(ctx.bundle ?? {}).find(
            output =>
              output.type === 'asset' && (output.originalFileNames ?? []).some(name => name.endsWith(hero.source))
          )
          // Throw rather than skip. A renamed or deleted hero asset would otherwise drop the preload in
          // silence, and the only symptom would be a slower LCP noticed in some Lighthouse run weeks later.
          if (!emitted) throw new Error(`preload-hero: ${hero.source} is not in the bundle — was it renamed?`)
          return {
            tag: 'link',
            attrs: {
              rel: 'preload',
              as: 'image',
              href: `${base}${emitted.fileName}`,
              media: hero.media,
              fetchpriority: 'high'
            },
            injectTo: 'head-prepend' as const
          }
        })
      }
    }
  }
}

// The app package.json is `private` and vite doesn't copy it, so emit a publishable package.json into
// dist. That's the manifest npm/oddish publishes; the CDN serves this package at <name>/<version>/.
function emitPackageJson() {
  return {
    name: 'emit-package-json',
    closeBundle() {
      const out = {
        name: pkg.name,
        version: pkg.version,
        main: 'index.js',
        author: 'Decentraland',
        license: 'Apache-2.0',
        repository: { type: 'git', url: 'git+https://github.com/decentraland/shop.git' }
      }
      writeFileSync(fileURLToPath(new URL('./dist/package.json', import.meta.url)), `${JSON.stringify(out, null, 2)}\n`)
    }
  }
}

export default defineConfig({
  base,
  // Two dev servers on one checkout would otherwise share `node_modules/.vite` and clobber each other's
  // dep optimization — the second one's browser then 504s on stale, already-rewritten dep URLs and the
  // page crashes. The e2e suite does exactly that: a shared server plus the outfits spec's own. Give
  // each a private cache dir via this env var (see e2e/helpers/app.ts `hermeticViteEnv`).
  cacheDir: process.env.VITE_CACHE_DIR || undefined,
  // Baked in at build time rather than read from an env var, so the runtime reports exactly the release
  // the source maps were uploaded under (see `sentryRelease` above). vitest defines its own.
  define: { __SENTRY_RELEASE__: JSON.stringify(sentryRelease) },
  plugins: [
    react(),
    nodePolyfills({ globals: { Buffer: true, global: true, process: true } }),
    preloadHero(),
    emitPackageJson(),
    ...(sentryUpload
      ? [
          sentryVitePlugin({
            org: process.env.SENTRY_ORG,
            project: process.env.SENTRY_PROJECT,
            authToken: process.env.SENTRY_AUTH_TOKEN,
            release: { name: sentryRelease },
            // Don't ship .map files to the CDN — upload then delete them.
            sourcemaps: { filesToDeleteAfterUpload: ['./dist/**/*.map'] }
          })
        ]
      : [])
  ],
  resolve: {
    alias: [
      { find: '~', replacement: fileURLToPath(new URL('./src', import.meta.url)) },
      // Cross-chain SDK we don't use; stub it so decentraland-transactions bundles without it.
      // Anchored regexes so the /dist/types subpath doesn't get mangled by prefix matching.
      {
        find: /^@0xsquid\/sdk\/dist\/types$/,
        replacement: fileURLToPath(new URL('./src/stubs/squid.ts', import.meta.url))
      },
      { find: /^@0xsquid\/sdk$/, replacement: fileURLToPath(new URL('./src/stubs/squid.ts', import.meta.url)) }
    ]
  },
  build: {
    // Not the default 'assets': that collides with the app's /assets route, and on hosts that serve
    // the dist folder at the root (Vercel previews) a hard load of /assets hits the DIRECTORY before
    // the SPA rewrite and serves a chunk instead of the page. Still true now that /assets is only a
    // redirect to /items — an indexed link has to reach the redirect to be forwarded at all.
    assetsDir: '_assets',
    // Emit source maps only for release builds that upload them to Sentry (deleted after upload).
    sourcemap: sentryUpload,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        // Split the heaviest vendors into their own cacheable chunks so they download in parallel
        // with (and stay cached across) the app code, instead of one ~2MB entry blob. Routes are
        // additionally lazy-loaded in App.tsx, and WearablePreview via LazyWearablePreview.
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined
          if (/[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id))
            return 'react'
          if (/[\\/]node_modules[\\/](ethers|@ethersproject)[\\/]/.test(id)) return 'ethers'
          // @dcl/schemas is a CommonJS barrel (no ESM, no exports map) so importing a single enum
          // pulls its whole ajv-based validation stack. The app uses a few enums eagerly, so it can't
          // be lazy-loaded — isolate it + ajv into one long-lived cacheable chunk (shared with the
          // lazy routes) instead of baking ~1MB of it into the entry blob.
          if (/[\\/]node_modules[\\/](@dcl[\\/]schemas|ajv|ajv-keywords|ajv-errors|ajv-formats|fast-uri)[\\/]/.test(id))
            return 'dcl-schemas'
          // Sentry loads eagerly (initSentry runs before the first render and App wraps routes in its
          // ErrorBoundary), so it can't be deferred without dropping early-error capture — split it out
          // of the entry into its own chunk instead.
          if (/[\\/]node_modules[\\/](@sentry|@sentry-internal)[\\/]/.test(id)) return 'sentry'
          // formatjs/react-intl message pipeline is eager via I18nProvider; give it its own chunk.
          if (/[\\/]node_modules[\\/](@formatjs|intl-messageformat|intl-messageformat-parser)[\\/]/.test(id))
            return 'intl'
          // Let rollup split @mui/@emotion/decentraland-ui2 naturally: the heavy MUI lives in the
          // (dynamic) wallet-modal + lazy-route chunks, so forcing it all into one eager chunk would
          // drag the whole thing in for any tiny eager use.
          return undefined
        }
      }
    }
  },
  server: {
    port: 5173,
    // Proxy the auth app so sign-in works on localhost (same-origin → shared identity storage).
    // Vercel previews need the same thing and get it from the rewrite in vercel.json — keep the two
    // in step, and note that neither applies to a real deploy, where /auth is genuinely same-origin.
    //
    // The key is a REGEXP, not a plain prefix, and that matters: a plain '/auth' also matches
    // /authorizations, which got proxied to decentraland.zone, so a hard load (or a refresh, or a shared
    // link) rendered that site's shell instead of the app — a blank page.
    proxy: {
      '^/auth(/|$)': {
        target: 'https://decentraland.zone',
        changeOrigin: true,
        secure: false,
        followRedirects: true,
        ws: true
      },
      // The marketing CMS. It answers a browser with `access-control-allow-origin` echoing the caller's
      // origin, but ONLY for decentraland.org and .zone — a localhost origin gets `false` back, so every
      // read fails and the campaign surfaces silently fall back to their defaults. Same-origin through
      // here instead, so a developer can see real CMS content locally.
      //
      // Reached by pointing the app at it for the dev server only, which needs no committed config:
      //   VITE_CONTENTFUL_URL=/cms npm run dev
      // Deliberately NOT put in `.env.local`: a VITE_* var there is also read by vitest and by the e2e
      // dev server, where it would send mocked CMS reads to a path nothing serves.
      '^/cms(/|$)': {
        target: 'https://cms-api.decentraland.org',
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/cms/, '')
      }
    }
  }
})
