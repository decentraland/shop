import { lazy, Suspense, useEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
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
const PAGE_NAMES: Record<string, string> = {
  '/overview': 'overview',
  '/assets': 'assets',
  '/my-assets': 'my_assets',
  '/my-favorites': 'favorites',
  '/activity': 'activity',
  '/import': 'import',
  '/store-settings': 'store_settings',
  '/cart': 'cart',
  '/credits': 'credits',
  '/success': 'success',
  '/authorizations': 'authorizations'
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
const ImportListings = lazy(() => import('~/pages/ImportListings').then(m => ({ default: m.ImportListings })))
const Cart = lazy(() => import('~/pages/Cart').then(m => ({ default: m.Cart })))
const Authorizations = lazy(() => import('~/pages/Authorizations').then(m => ({ default: m.Authorizations })))
const GetCredits = lazy(() => import('~/pages/GetCredits').then(m => ({ default: m.GetCredits })))
const Success = lazy(() => import('~/pages/Success').then(m => ({ default: m.Success })))
const NotFound = lazy(() => import('~/pages/NotFound').then(m => ({ default: m.NotFound })))

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
          : path.startsWith('/assets/creator/')
            ? 'creator'
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
              <Route path="/assets" element={<Assets />} />
              {/* Assets is now the unified browse (native + legacy). Keep /market as an alias so old
                links don't 404 — it lands on the same grid. */}
              <Route path="/market" element={<Navigate to="/assets" replace />} />
              {/* Two detail routes so the id is never ambiguous (an itemId and a tokenId can collide —
                  item 0's tokens have small tokenIds). /item is the generic buy view; /token is a
                  specific owned/listed copy. Both render ItemDetail, which branches on the param. */}
              <Route path="/item/:contractAddress/:itemId" element={<ItemDetail />} />
              <Route path="/token/:contractAddress/:tokenId" element={<ItemDetail />} />
              <Route path="/collection/:contractAddress" element={<Collection />} />
              <Route path="/assets/creator/:address" element={<Creator />} />
              <Route path="/store-settings" element={<StoreSettings />} />
              <Route path="/my-assets" element={<MyAssets />} />
              <Route path="/my-favorites" element={<MyFavorites />} />
              <Route path="/activity" element={<Activity />} />
              {/* Activity absorbed the old My Purchases page — keep the old path as a redirect so
                  existing links (e.g. the Success page, bookmarks) don't 404. */}
              <Route path="/my-purchases" element={<Navigate to="/activity" replace />} />
              <Route path="/import" element={<ImportListings />} />
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
