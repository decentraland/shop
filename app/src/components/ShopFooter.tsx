import { lazy, Suspense } from 'react'
import { useLocale } from '~/store/locale'
import { LOCALES, type Locale } from '~/intl/i18n'
// Type-only imports so this module doesn't pull the UI2 Footer (and MUI) into the entry chunk — the
// Footer itself is lazy-loaded (mirrors TopNav's lazy Navbar).
import type { FooterProps, Language, SupportedLanguage } from 'decentraland-ui2/dist/components/Footer'

const Footer = lazy(() => import('decentraland-ui2/dist/components/Footer').then(m => ({ default: m.Footer })))

// Only the languages the Shop ships. Our Locale values ('en' | 'es') are exactly the UI2
// SupportedLanguage values, so a cast is safe.
const LANGUAGES: Language[] = [
  { code: 'en' as SupportedLanguage, name: 'English', flag: '🇺🇸' },
  { code: 'es' as SupportedLanguage, name: 'Español', flag: '🇪🇸' }
]

// The site footer (UI2) — also home to the language selector, wired to our locale store.
export function ShopFooter() {
  const locale = useLocale(s => s.locale)
  const setLocale = useLocale(s => s.setLocale)
  const onLanguageChange: NonNullable<FooterProps['onLanguageChange']> = code => {
    if ((LOCALES as readonly string[]).includes(code)) setLocale(code as Locale)
  }
  return (
    <Suspense fallback={null}>
      <Footer languages={LANGUAGES} selectedLanguage={locale as SupportedLanguage} onLanguageChange={onLanguageChange} />
    </Suspense>
  )
}
