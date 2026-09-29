import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useAnalytics } from '@dcl/hooks'
import { config } from '~/config'
import { trackPage } from '~/lib/analytics'

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

export function pageNameFor(pathname: string): string {
  return (
    PAGE_NAMES[pathname] ??
    (pathname.startsWith('/item/') || pathname.startsWith('/token/')
      ? 'item'
      : pathname.startsWith('/collection/')
        ? 'collection'
        : pathname.startsWith('/items/creator/')
          ? 'creator'
          : pathname.startsWith('/items/outfits/')
            ? 'outfit'
            : pathname.startsWith('/outfits/')
              ? 'outfit_studio'
              : 'other')
  )
}

/**
 * Emits the `Shop Viewed Page` event for the current route.
 *
 * Gated on `isInitialized` because React runs a child's effect before its parent's, and the provider
 * awaits an import before registering the instance: an ungated effect fires while Segment is still
 * missing and the landing page view is lost for good, since the pathname never changes to re-fire it.
 */
export function usePageView(): void {
  const location = useLocation()
  const { isInitialized } = useAnalytics()

  useEffect(() => {
    if (!isInitialized) return
    // The invented store is a reviewer reading it, not a visit. Only honoured where the override itself
    // is (config.previewHost), so the live Shop always counts.
    // Read off window rather than added as a dependency: a page view is per ROUTE, and depending on the
    // query string would count every filter change on the grids as a visit.
    const params = new URLSearchParams(window.location.search)
    if (config.previewHost && params.get('mock') === '1') return
    trackPage(pageNameFor(location.pathname))
  }, [location.pathname, isInitialized])
}
