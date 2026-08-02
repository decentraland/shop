import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { App } from '~/App'
import { I18nProvider } from '~/intl/I18nProvider'
import { initSentry } from '~/lib/monitoring'
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
