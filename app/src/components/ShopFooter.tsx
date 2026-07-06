import { lazy, Suspense } from 'react'
import { useLocale } from '~/store/locale'
import { LOCALES, type Locale } from '~/intl/i18n'

// The site footer (UI2) is lazy-loaded (like the Navbar) so MUI stays out of the entry chunk. Its
// language dropdown is wired to our locale store. The actual UI2 imports + theme provider live in
// ShopFooterInner so they only load with this chunk.
const ShopFooterInner = lazy(() => import('~/components/ShopFooterInner'))

export function ShopFooter() {
  const locale = useLocale(s => s.locale)
  const setLocale = useLocale(s => s.setLocale)
  return (
    <Suspense fallback={null}>
      <ShopFooterInner
        locale={locale}
        onChange={code => {
          if ((LOCALES as readonly string[]).includes(code)) setLocale(code as Locale)
        }}
      />
    </Suspense>
  )
}
