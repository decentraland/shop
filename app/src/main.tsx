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

// The Shop is served by-path at <domain>/shop only on the known deployed hosts
// (decentraland.zone/today/org). Everything else — local dev, e2e, preview deploys,
// Docker QA, IP access — runs at the root, so match those hosts positively (mirrors the
// marketplace) instead of a negative localhost check that would wrongly apply /shop elsewhere.
const routerBasename = /^decentraland\.(zone|today|org)$/.test(window.location.hostname) ? '/shop' : undefined

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
