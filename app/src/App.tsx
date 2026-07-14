import { lazy, Suspense, useEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import * as Sentry from '@sentry/react'
import { NavBar } from '~/components/NavBar'
import { Toaster } from '~/components/Toaster'
import { FittingRoom } from '~/components/FittingRoom'
import { ShopFooter } from '~/components/ShopFooter'
import { PreviewWarmer } from '~/components/PreviewWarmer'
import { useAccountWatcher } from '~/hooks/useAccountWatcher'
import { initAnalytics, trackPage } from '~/lib/analytics'
import { Overview } from '~/pages/Overview'

// Route path → funnel page name (see design/SHOP_TRACKING_SPEC.md §5.2).
const PAGE_NAMES: Record<string, string> = {
  '/overview': 'overview',
  '/assets': 'assets',
  '/my-assets': 'my_assets',
  '/my-favorites': 'favorites',
  '/my-purchases': 'my_purchases',
  '/import': 'import',
  '/cart': 'cart',
  '/credits': 'credits',
  '/success': 'success'
}

// Overview (home) stays eager for the fastest first paint; every other route is code-split so it
// stays out of the initial bundle and loads on navigation (see vite manualChunks + LazyWearablePreview).
const Assets = lazy(() => import('~/pages/Assets').then(m => ({ default: m.Assets })))
const ItemDetail = lazy(() => import('~/pages/ItemDetail').then(m => ({ default: m.ItemDetail })))
const Collection = lazy(() => import('~/pages/Collection').then(m => ({ default: m.Collection })))
const Creator = lazy(() => import('~/pages/Creator').then(m => ({ default: m.Creator })))
const MyAssets = lazy(() => import('~/pages/MyAssets').then(m => ({ default: m.MyAssets })))
const MyFavorites = lazy(() => import('~/pages/MyFavorites').then(m => ({ default: m.MyFavorites })))
const MyPurchases = lazy(() => import('~/pages/MyPurchases').then(m => ({ default: m.MyPurchases })))
const ImportListings = lazy(() => import('~/pages/ImportListings').then(m => ({ default: m.ImportListings })))
const Cart = lazy(() => import('~/pages/Cart').then(m => ({ default: m.Cart })))
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

// Shown if a page throws during render. Keep it generic — never surface the raw error (PII rule).
// The error itself is reported to Sentry by the surrounding Sentry.ErrorBoundary.
function CrashFallback() {
  return (
    <div className="overview__empty">
      <p className="overview__empty-title">Something went wrong</p>
      <p className="muted">This page hit an unexpected error. Try reloading.</p>
      <button className="btn btn--purple" onClick={() => window.location.reload()}>
        Reload
      </button>
    </div>
  )
}

export function App() {
  // Reload when the injected wallet switches/disconnects accounts (see the hook for the rationale).
  useAccountWatcher()
  const location = useLocation()

  // Load Segment once (no-op without a write key), then emit a page view on each route change.
  useEffect(() => {
    initAnalytics()
  }, [])
  useEffect(() => {
    const path = location.pathname
    const page =
      PAGE_NAMES[path] ??
      (path.startsWith('/item/')
        ? 'item'
        : path.startsWith('/collection/')
          ? 'collection'
          : path.startsWith('/creator/')
            ? 'creator'
            : 'other')
    trackPage(page)
  }, [location.pathname])

  return (
    <>
      <Toaster />
      <PreviewWarmer />
      <FittingRoom />
      <NavBar />
      <main className="page">
        <Sentry.ErrorBoundary fallback={<CrashFallback />}>
          <Suspense fallback={<PageFallback />}>
            <Routes>
            <Route path="/" element={<Navigate to="/overview" replace />} />
            <Route path="/overview" element={<Overview />} />
            <Route path="/assets" element={<Assets />} />
            {/* Assets is now the unified browse (native + legacy). Keep /market as an alias so old
                links don't 404 — it lands on the same grid. */}
            <Route path="/market" element={<Navigate to="/assets" replace />} />
            <Route path="/item/:contractAddress/:tokenId" element={<ItemDetail />} />
            <Route path="/collection/:contractAddress" element={<Collection />} />
            <Route path="/creator/:address" element={<Creator />} />
            <Route path="/my-assets" element={<MyAssets />} />
            <Route path="/my-favorites" element={<MyFavorites />} />
            <Route path="/my-purchases" element={<MyPurchases />} />
            <Route path="/import" element={<ImportListings />} />
            <Route path="/cart" element={<Cart />} />
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
