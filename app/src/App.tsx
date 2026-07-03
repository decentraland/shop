import { Routes, Route, Navigate } from 'react-router-dom'
import { NavBar } from '~/components/NavBar'
import { Toaster } from '~/components/Toaster'
import { PreviewWarmer } from '~/components/PreviewWarmer'
import { useAccountWatcher } from '~/hooks/useAccountWatcher'
import { Overview } from '~/pages/Overview'
import { Assets } from '~/pages/Assets'
import { MyAssets } from '~/pages/MyAssets'
import { MyFavorites } from '~/pages/MyFavorites'
import { MyPurchases } from '~/pages/MyPurchases'
import { ImportListings } from '~/pages/ImportListings'
import { Cart } from '~/pages/Cart'
import { GetCredits } from '~/pages/GetCredits'
import { Success } from '~/pages/Success'
import { ItemDetail } from '~/pages/ItemDetail'

export function App() {
  // Reload when the injected wallet switches/disconnects accounts (see the hook for the rationale).
  useAccountWatcher()

  return (
    <>
      <Toaster />
      <PreviewWarmer />
      <NavBar />
      <main className="page">
        <Routes>
          <Route path="/" element={<Navigate to="/overview" replace />} />
          <Route path="/overview" element={<Overview />} />
          <Route path="/assets" element={<Assets />} />
          <Route path="/item/:contractAddress/:tokenId" element={<ItemDetail />} />
          <Route path="/my-assets" element={<MyAssets />} />
          <Route path="/my-favorites" element={<MyFavorites />} />
          <Route path="/my-purchases" element={<MyPurchases />} />
          <Route path="/import" element={<ImportListings />} />
          <Route path="/cart" element={<Cart />} />
          <Route path="/credits" element={<GetCredits />} />
          <Route path="/success" element={<Success />} />
        </Routes>
      </main>
    </>
  )
}
