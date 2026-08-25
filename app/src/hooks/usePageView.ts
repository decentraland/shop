import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useAnalytics } from '@dcl/hooks'
import { trackPage } from '~/lib/analytics'

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
    trackPage(pageNameFor(location.pathname))
  }, [location.pathname, isInitialized])
}
