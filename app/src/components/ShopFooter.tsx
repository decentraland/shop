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
    // The UI2 footer is scaled to its own (larger) design system. It mixes rem text with px spacing,
    // so a parent font-size can't shrink it — `zoom` scales the whole thing down to match the shop's
    // compact scale. See .shop-footer in index.css.
    <div className="shop-footer">
      <Suspense fallback={null}>
        <ShopFooterInner
          locale={locale}
          onChange={code => {
            if ((LOCALES as readonly string[]).includes(code)) setLocale(code as Locale)
          }}
        />
      </Suspense>
    </div>
  )
}
