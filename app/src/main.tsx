import React, { useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createBrowserRouter, RouterProvider, useRouteError } from 'react-router-dom'
import { App, CrashFallback } from '~/App'
import { I18nProvider } from '~/intl/I18nProvider'
import { captureError, initSentry } from '~/lib/monitoring'
import './styles/index.css'

// Start error monitoring before the first render (no-op unless VITE_SENTRY_DSN is set).
initSentry()

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } }
})

// The Shop is served by-path at <domain>/shop in deployed envs (decentraland.zone/today/org), but at
// the root on localhost, e2e and Vercel previews. Detect by path, not hostname: a hostname allowlist
// renders a blank page (router basename mismatch) on any host it doesn't know about.
const { pathname } = window.location
const routerBasename = pathname === '/shop' || pathname.startsWith('/shop/') ? '/shop' : undefined

// A data router only so editors can block in-app navigation (useBlocker); App still declares every route.
// The router's own boundary would swallow a crash outside App's Sentry.ErrorBoundary, so report it here.
function RootCrash() {
  const error = useRouteError()
  useEffect(() => captureError(error, { flow: 'root' }), [error])
  return <CrashFallback />
}

const router = createBrowserRouter([{ path: '*', element: <App />, errorElement: <RootCrash /> }], {
  basename: routerBasename
})

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <RouterProvider router={router} />
      </I18nProvider>
    </QueryClientProvider>
  </React.StrictMode>
)
