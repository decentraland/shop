import { lazy, Suspense, useEffect } from 'react'
import { Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom'
import * as Sentry from '@sentry/react'
import { NavBar } from '~/components/NavBar'
import { Toaster } from '~/components/Toaster'
import { FittingRoom } from '~/components/FittingRoom'
import { ShopFooter } from '~/components/ShopFooter'
import { HoverPreviewLayer } from '~/components/HoverPreviewLayer'
import { ScrollReset } from '~/components/ScrollReset'
import { useAccountWatcher } from '~/hooks/useAccountWatcher'
import { useDialogScrollLock } from '~/hooks/useDialogScrollLock'
import { useWallet } from '~/store/wallet'
import { initAnalytics, trackPage } from '~/lib/analytics'
import { config } from '~/config'
import { isIapMode } from '~/lib/iap'
import { Overview } from '~/pages/Overview'
import * as OV from '~/pages/Overview.styles'
import { Button } from '~/components/Button'
import styled from '@emotion/styled'
import { t } from '~/intl/i18n'

// Route path → funnel page name (see design/SHOP_TRACKING_SPEC.md §5.2).
//
// The NAMES are frozen even where the route was renamed: they are the `page` prop of `Shop Viewed Page`,
// so 'assets'/'my_assets' are what every existing funnel and dashboard groups on. Renaming them to match
// the new paths would silently split each series in two at the deploy.
const PAGE_NAMES: Record<string, string> = {
  '/overview': 'overview',
  '/items': 'assets',
  '/my-items': 'my_assets',
  '/my-store': 'my_store',
  '/my-favorites': 'favorites',
  '/activity': 'activity',
  '/event': 'event',
  '/import': 'import',
  '/store-settings': 'store_settings',
  '/cart': 'cart',
  '/credits': 'credits',
  '/success': 'success',
  '/authorizations': 'authorizations',
  '/outfits/manage': 'outfit_studio',
  '/outfits/new': 'outfit_studio'
}

// Overview (home) stays eager for the fastest first paint; every other route is code-split so it
// stays out of the initial bundle and loads on navigation (see vite manualChunks + LazyWearablePreview).
const Assets = lazy(() => import('~/pages/Assets').then(m => ({ default: m.Assets })))
const Event = lazy(() => import('~/pages/Event').then(m => ({ default: m.Event })))
const ItemDetailRoute = lazy(() => import('~/pages/ItemDetail').then(m => ({ default: m.ItemDetailRoute })))
const Collection = lazy(() => import('~/pages/Collection').then(m => ({ default: m.Collection })))
const Creator = lazy(() => import('~/pages/Creator').then(m => ({ default: m.Creator })))
const StoreSettings = lazy(() => import('~/pages/StoreSettings').then(m => ({ default: m.StoreSettings })))
const MyAssets = lazy(() => import('~/pages/MyAssets').then(m => ({ default: m.MyAssets })))
const MyStore = lazy(() => import('~/pages/MyStore').then(m => ({ default: m.MyStore })))
const MyFavorites = lazy(() => import('~/pages/MyFavorites').then(m => ({ default: m.MyFavorites })))
const Activity = lazy(() => import('~/pages/Activity').then(m => ({ default: m.Activity })))
const Cart = lazy(() => import('~/pages/Cart').then(m => ({ default: m.Cart })))
const GetCredits = lazy(() => import('~/pages/GetCredits').then(m => ({ default: m.GetCredits })))
const Success = lazy(() => import('~/pages/Success').then(m => ({ default: m.Success })))
const NotFound = lazy(() => import('~/pages/NotFound').then(m => ({ default: m.NotFound })))
const OutfitDetail = lazy(() => import('~/pages/OutfitDetail').then(m => ({ default: m.OutfitDetail })))
const OutfitStudio = lazy(() => import('~/pages/OutfitStudio').then(m => ({ default: m.OutfitStudio })))

function PageFallback() {
  return (
    <div className="page-loading" aria-busy="true">
      <span className="spinner" aria-hidden />
    </div>
  )
}

/**
 * Approvals left the Shop for the marketplace, which is where on-chain authorizations live and where the
 * same grants are already listed — batched, and only the ones actually granted.
 *
 * An external navigation rather than a <Navigate>, so it leaves the SPA; `replace` rather than `assign` so
 * Back returns where the visitor came from instead of re-firing this route. The URL is absolute and comes
 * from config, so one build still serves .zone/.today/.org, and the /shop basename is irrelevant to it.
 *
 * The page keeps its PAGE_NAMES entry, but read that as best-effort: trackPage queues through the Segment
 * SDK and the unload can beat the flush. It records the attempt, not the arrival — measuring arrival needs
 * attribution on the marketplace side. Never delay the navigation for it.
 */
function MarketplaceSettingsRedirect() {
  useEffect(() => {
    window.location.replace(`${config.marketplaceUrl}/settings`)
  }, [])
  return <PageFallback />
}
const ReloadCta = styled(Button)`
  margin-top: 10px;
`

// Shown if a page throws during render. Keep it generic — never surface the raw error (PII rule).
// The error itself is reported to Sentry by the surrounding Sentry.ErrorBoundary. Reuses the home
// page's empty-state shell.
function CrashFallback() {
  return (
    <OV.Empty>
      <OV.EmptyTitle>{t('app.crash.title')}</OV.EmptyTitle>
      <OV.EmptyBody>{t('app.crash.body')}</OV.EmptyBody>
      <ReloadCta variant="white" onClick={() => window.location.reload()}>
        {t('app.crash.reload')}
      </ReloadCta>
    </OV.Empty>
  )
}

// Redirect for a route whose PREFIX was renamed, forwarding whatever followed it: /assets/creator/0x1?q=a
// → /items/creator/0x1?q=a. A plain <Navigate to="/items"> can't do this — it takes a literal path, so it
// would drop both the sub-path and the query, landing a shared creator or outfit link on the bare grid.
function RenamedPathRedirect({ to }: { to: string }) {
  const rest = useParams()['*']
  const { search, hash } = useLocation()
  return <Navigate to={`${to}${rest ? `/${rest}` : ''}${search}${hash}`} replace />
}

// Alias to a fixed path, carrying the incoming query and hash. The root alias needs it most: every
// in-world entry point opens `/?utm_source=client`, and Segment resolves the landing page view when
// analytics.js finishes loading — long after a plain <Navigate> would have dropped the tag.
//
// `to`'s own params win a collision, since they are what the alias exists to point at.
export function AliasRedirect({ to }: { to: string }) {
  const { search, hash } = useLocation()
  // Split on the FIRST '?' only and keep the rest verbatim: `split('?')` would discard everything past a
  // second one, and `split('?', 2)` is not a maxsplit in JS — it caps the array, dropping the tail all the same.
  const mark = to.indexOf('?')
  const path = mark === -1 ? to : to.slice(0, mark)
  const params = new URLSearchParams(search)
  for (const [key, value] of new URLSearchParams(mark === -1 ? '' : to.slice(mark + 1))) params.set(key, value)
  const query = params.toString()
  return <Navigate to={`${path}${query ? `?${query}` : ''}${hash}`} replace />
}

export function App() {
  // Reload when the injected wallet switches/disconnects accounts (see the hook for the rationale).
  useAccountWatcher()
  useDialogScrollLock()
  const location = useLocation()

  // Start the silent wallet restore HERE, not only in the navbar. The navbar used to be the only caller,
  // which made every consumer of the session depend on that one component staying mounted. The store
  // dedupes concurrent callers, so the navbar can keep asking too.
  const restoreWallet = useWallet(s => s.restore)
  useEffect(() => {
    void restoreWallet()
  }, [restoreWallet])

  // Load Segment once (no-op without a write key), then emit a page view on each route change.
  useEffect(() => {
    initAnalytics()
  }, [])
  useEffect(() => {
    const path = location.pathname
    const page =
      PAGE_NAMES[path] ??
      (path.startsWith('/item/') || path.startsWith('/token/')
        ? 'item'
        : path.startsWith('/collection/')
          ? 'collection'
          : path.startsWith('/items/creator/')
            ? 'creator'
            : path.startsWith('/items/outfits/')
              ? 'outfit'
              : path.startsWith('/outfits/')
                ? 'outfit_studio'
                : 'other')
    trackPage(page)
  }, [location.pathname])

  // Nothing gates the shell. There used to be a pre-launch curtain here that rendered NOTHING until a
  // feature-flag read and the wallet restore had both settled — and since that read only starts once the
  // entry chunk has executed, it held the FIRST PAINT of every visit behind a network round trip
  // (measured: flags at 231ms, first render at 273ms). The Shop is launched, the flag is no longer in the
  // file, and the half that actually refuses a purchase was always the server's: credits-server reads
  // `shop-prelaunch` on /credits/authorize against the signed-fetch address. That half is untouched, so
  // closing the Shop again is a server concern plus a new curtain, not a revert of this.
  return (
    <>
      <ScrollReset />
      <Toaster />
      <HoverPreviewLayer />
      <FittingRoom />
      <NavBar />
      {/* The route is exposed so a page can opt OUT of the shell's fill-the-viewport min-height. Pages
          whose content is genuinely short (the credits packs) look better with the footer visible than
          with a screenful of empty space under a single card — see .page[data-route] in index.css. */}
      <main className="page" data-route={location.pathname}>
        <Sentry.ErrorBoundary fallback={<CrashFallback />}>
          <Suspense fallback={<PageFallback />}>
            {/* Never add a top-level /shop route: main.tsx detects the router basename from a /shop
                path prefix, so on hosts that serve the app at the root (Vercel previews, localhost)
                that URL would be read as the app's mount point, not as a route. */}
            <Routes>
              <Route path="/" element={<AliasRedirect to="/overview" />} />
              <Route path="/overview" element={<Overview />} />
              <Route path="/items" element={<Assets />} />
              {/* The seasonal event's storefront. Generic on purpose: which event it is comes from the
                  CMS, so one route serves every campaign and nothing has to be deployed to change it. The
                  page sends visitors to /items when no campaign is running. */}
              <Route path="/event" element={<Event />} />
              {/* Items is the unified browse (native + legacy). Keep /market as an alias so old
                links don't 404 — it lands on the same grid. */}
              <Route path="/market" element={<AliasRedirect to="/items" />} />
              {/* Two detail routes so the id is never ambiguous (an itemId and a tokenId can collide —
                  item 0's tokens have small tokenIds). /item is the generic buy view; /token is a
                  specific owned/listed copy. Both render ItemDetail, which branches on the param. */}
              <Route path="/item/:contractAddress/:itemId" element={<ItemDetailRoute />} />
              <Route path="/token/:contractAddress/:tokenId" element={<ItemDetailRoute />} />
              <Route path="/collection/:contractAddress" element={<Collection />} />
              <Route path="/items/creator/:address" element={<Creator />} />
              <Route path="/outfits/manage" element={<OutfitStudio />} />
              <Route path="/outfits/new" element={<OutfitStudio />} />
              <Route path="/outfits/:id/edit" element={<OutfitStudio />} />
              {/* Under /items so the Collectibles tab lights up on an outfit. */}
              <Route path="/items/outfits/:id" element={<OutfitDetail />} />
              <Route path="/store-settings" element={<StoreSettings />} />
              <Route path="/my-items" element={<MyAssets />} />
              <Route path="/my-store" element={<MyStore />} />
              <Route path="/my-favorites" element={<MyFavorites />} />
              <Route path="/activity" element={<Activity />} />
              {/* Activity absorbed the old My Purchases page — keep the old path as a redirect so
                  existing links (e.g. the Success page, bookmarks) don't 404. */}
              <Route path="/my-purchases" element={<AliasRedirect to="/activity" />} />
              {/* /assets and /my-assets were renamed to /items and /my-items when the user-facing noun
                  became "item". The old paths MUST stay: /assets is published in public/sitemap.xml, so it
                  is indexed, and creator storefronts (/assets/creator/:address) and outfit pages
                  (/assets/outfits/:id) have been shared as links. The splat covers both of those plus
                  anything added under the prefix later; the bare /assets is listed separately so the
                  redirect doesn't depend on a splat matching zero segments. */}
              <Route path="/assets" element={<RenamedPathRedirect to="/items" />} />
              <Route path="/assets/*" element={<RenamedPathRedirect to="/items" />} />
              <Route path="/my-assets" element={<RenamedPathRedirect to="/my-items" />} />
              {/* The migration tool moved INTO Activity, behind a chip. /import stays as a redirect:
                  it has been the target of the My Items nudge for months, so it is in histories and
                  bookmarks — and the query is what lands on the tool rather than on the feed. */}
              <Route path="/import" element={<AliasRedirect to="/activity?section=listings" />} />
              <Route path="/cart" element={<Cart />} />
              <Route path="/authorizations" element={<MarketplaceSettingsRedirect />} />
              {/* Selling credits is the one thing the Shop cannot do inside the iOS app's web view — the
                  app sells them through In-App Purchase. Hiding the entrances is not enough on its own:
                  the route stays addressable, and a stale link or a back-navigation would land straight on
                  the pack picker. Redirected rather than 404'd so it reads as "not a thing here", and the
                  buyer keeps browsing instead of hitting a dead end. */}
              <Route path="/credits" element={isIapMode() ? <Navigate to="/overview" replace /> : <GetCredits />} />
              <Route path="/success" element={<Success />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </Sentry.ErrorBoundary>
      </main>
      {/* Footer is non-critical + pulls the UI2/MUI theme — isolate it so a footer error can never
          white-screen the app (it lives outside the main ErrorBoundary). */}
      <Sentry.ErrorBoundary fallback={<></>}>
        <ShopFooter />
      </Sentry.ErrorBoundary>
    </>
  )
}
