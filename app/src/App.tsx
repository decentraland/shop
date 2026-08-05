import { lazy, Suspense, useEffect } from 'react'
import { Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom'
import * as Sentry from '@sentry/react'
import { NavBar } from '~/components/NavBar'
import { PrelaunchNotice } from '~/components/PrelaunchNotice'
import { Toaster } from '~/components/Toaster'
import { FittingRoom } from '~/components/FittingRoom'
import { ShopFooter } from '~/components/ShopFooter'
import { HoverPreviewLayer } from '~/components/HoverPreviewLayer'
import { ScrollReset } from '~/components/ScrollReset'
import { useAccountWatcher } from '~/hooks/useAccountWatcher'
import { useShopPrelaunch } from '~/hooks/useShopPrelaunch'
import { useWallet } from '~/store/wallet'
import { initAnalytics, trackPage } from '~/lib/analytics'
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
  '/my-favorites': 'favorites',
  '/activity': 'activity',
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
const ItemDetail = lazy(() => import('~/pages/ItemDetail').then(m => ({ default: m.ItemDetail })))
const Collection = lazy(() => import('~/pages/Collection').then(m => ({ default: m.Collection })))
const Creator = lazy(() => import('~/pages/Creator').then(m => ({ default: m.Creator })))
const StoreSettings = lazy(() => import('~/pages/StoreSettings').then(m => ({ default: m.StoreSettings })))
const MyAssets = lazy(() => import('~/pages/MyAssets').then(m => ({ default: m.MyAssets })))
const MyFavorites = lazy(() => import('~/pages/MyFavorites').then(m => ({ default: m.MyFavorites })))
const Activity = lazy(() => import('~/pages/Activity').then(m => ({ default: m.Activity })))
const Cart = lazy(() => import('~/pages/Cart').then(m => ({ default: m.Cart })))
const Authorizations = lazy(() => import('~/pages/Authorizations').then(m => ({ default: m.Authorizations })))
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
      <p className="muted">{t('app.crash.body')}</p>
      <ReloadCta variant="purple" onClick={() => window.location.reload()}>
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

export function App() {
  // Reload when the injected wallet switches/disconnects accounts (see the hook for the rationale).
  useAccountWatcher()
  const prelaunch = useShopPrelaunch()
  const location = useLocation()

  // Start the silent wallet restore HERE, not only in the navbar.
  //
  // The curtain returns before the shell, so while it is up the navbar is unmounted — and the navbar is
  // what used to kick this off. That worked by accident: the restore promise outlived the unmount. It stops
  // working the moment the decision waits on the restore, because then nothing would ever start it and the
  // page would stay blank forever. The store dedupes concurrent callers, so the navbar can keep asking too.
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

  // The pre-launch curtain. Returned BEFORE the shell so no NavBar, footer or route is mounted: each of those
  // is a door into a Shop that is meant to be closed. Cosmetic only — what refuses a purchase is the same flag
  // read server-side by credits-server (see useShopPrelaunch).
  //
  // 'pending' renders NOTHING. The decision needs the wallet session, which arrives after the flag, and
  // showing either answer before both are in produced a visible flash of the holding page on every refresh
  // for wallets that are in fact allowed. Nothing is the only honest thing to show while the question is
  // open, and it is brief: an ungated environment never reaches this, and a gated one is waiting on a cached
  // flag read plus a storage read.
  if (prelaunch === 'pending') {
    return null
  }
  if (prelaunch === 'hidden') {
    return <PrelaunchNotice />
  }

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
              <Route path="/" element={<Navigate to="/overview" replace />} />
              <Route path="/overview" element={<Overview />} />
              <Route path="/items" element={<Assets />} />
              {/* Items is the unified browse (native + legacy). Keep /market as an alias so old
                links don't 404 — it lands on the same grid. */}
              <Route path="/market" element={<Navigate to="/items" replace />} />
              {/* Two detail routes so the id is never ambiguous (an itemId and a tokenId can collide —
                  item 0's tokens have small tokenIds). /item is the generic buy view; /token is a
                  specific owned/listed copy. Both render ItemDetail, which branches on the param. */}
              <Route path="/item/:contractAddress/:itemId" element={<ItemDetail />} />
              <Route path="/token/:contractAddress/:tokenId" element={<ItemDetail />} />
              <Route path="/collection/:contractAddress" element={<Collection />} />
              <Route path="/items/creator/:address" element={<Creator />} />
              <Route path="/outfits/manage" element={<OutfitStudio />} />
              <Route path="/outfits/new" element={<OutfitStudio />} />
              <Route path="/outfits/:id/edit" element={<OutfitStudio />} />
              {/* Under /items so the Collectibles tab lights up on an outfit. */}
              <Route path="/items/outfits/:id" element={<OutfitDetail />} />
              <Route path="/store-settings" element={<StoreSettings />} />
              <Route path="/my-items" element={<MyAssets />} />
              <Route path="/my-favorites" element={<MyFavorites />} />
              <Route path="/activity" element={<Activity />} />
              {/* Activity absorbed the old My Purchases page — keep the old path as a redirect so
                  existing links (e.g. the Success page, bookmarks) don't 404. */}
              <Route path="/my-purchases" element={<Navigate to="/activity" replace />} />
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
              <Route path="/import" element={<Navigate to="/activity?section=listings" replace />} />
              <Route path="/cart" element={<Cart />} />
              <Route path="/authorizations" element={<Authorizations />} />
              <Route path="/credits" element={<GetCredits />} />
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
