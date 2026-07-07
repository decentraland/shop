import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { App } from '~/App'
import { I18nProvider } from '~/intl/I18nProvider'
import { initSentry } from '~/lib/monitoring'
import './index.css'

// Start error monitoring before the first render (no-op unless VITE_SENTRY_DSN is set).
initSentry()

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } }
})

// The Shop is served by-path at <domain>/shop in every deployed env (decentraland.zone/today/org),
// so the router mounts under /shop. Local dev + e2e run at the root, so no basename there.
const isLocalHost = ['localhost', '127.0.0.1'].includes(window.location.hostname)
const routerBasename = isLocalHost ? undefined : '/shop'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <BrowserRouter basename={routerBasename}>
          <App />
        </BrowserRouter>
      </I18nProvider>
    </QueryClientProvider>
  </React.StrictMode>
)
