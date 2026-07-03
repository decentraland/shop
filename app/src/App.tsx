import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { NavBar } from '~/components/NavBar'
import { Toaster } from '~/components/Toaster'
import { PreviewWarmer } from '~/components/PreviewWarmer'
import { useAccountWatcher } from '~/hooks/useAccountWatcher'
import { Overview } from '~/pages/Overview'

// Overview (home) stays eager for the fastest first paint; every other route is code-split so it
// stays out of the initial bundle and loads on navigation (see vite manualChunks + LazyWearablePreview).
const Assets = lazy(() => import('~/pages/Assets').then(m => ({ default: m.Assets })))
const Market = lazy(() => import('~/pages/Market').then(m => ({ default: m.Market })))
const ItemDetail = lazy(() => import('~/pages/ItemDetail').then(m => ({ default: m.ItemDetail })))
const MyAssets = lazy(() => import('~/pages/MyAssets').then(m => ({ default: m.MyAssets })))
const MyFavorites = lazy(() => import('~/pages/MyFavorites').then(m => ({ default: m.MyFavorites })))
const MyPurchases = lazy(() => import('~/pages/MyPurchases').then(m => ({ default: m.MyPurchases })))
const ImportListings = lazy(() => import('~/pages/ImportListings').then(m => ({ default: m.ImportListings })))
const Cart = lazy(() => import('~/pages/Cart').then(m => ({ default: m.Cart })))
const GetCredits = lazy(() => import('~/pages/GetCredits').then(m => ({ default: m.GetCredits })))
const Success = lazy(() => import('~/pages/Success').then(m => ({ default: m.Success })))

function PageFallback() {
  return (
    <div className="page-loading" aria-busy="true">
      <span className="spinner" aria-hidden />
    </div>
  )
}

export function App() {
  // Reload when the injected wallet switches/disconnects accounts (see the hook for the rationale).
  useAccountWatcher()

  return (
    <>
      <Toaster />
      <PreviewWarmer />
      <NavBar />
      <main className="page">
        <Suspense fallback={<PageFallback />}>
          <Routes>
            <Route path="/" element={<Navigate to="/overview" replace />} />
            <Route path="/overview" element={<Overview />} />
            <Route path="/assets" element={<Assets />} />
            <Route path="/market" element={<Market />} />
            <Route path="/item/:contractAddress/:tokenId" element={<ItemDetail />} />
            <Route path="/my-assets" element={<MyAssets />} />
            <Route path="/my-favorites" element={<MyFavorites />} />
            <Route path="/my-purchases" element={<MyPurchases />} />
            <Route path="/import" element={<ImportListings />} />
            <Route path="/cart" element={<Cart />} />
            <Route path="/credits" element={<GetCredits />} />
            <Route path="/success" element={<Success />} />
          </Routes>
        </Suspense>
      </main>
    </>
  )
}
