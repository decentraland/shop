import { useEffect } from 'react'
import { RawIntlProvider } from 'react-intl'
import { useLocale } from '~/store/locale'
import { getIntl, setActiveLocale } from './i18n'

// Wraps the app in react-intl and keeps the module-level `t()` pointed at the current locale.
// `key={locale}` remounts the subtree on a language switch so every `t()` call re-evaluates — locale
// changes are rare, so a remount is a fine, simple way to make the plain `t()` API fully reactive.
export function I18nProvider({ children }: { children: React.ReactNode }) {
  const locale = useLocale(s => s.locale)
  setActiveLocale(locale) // render-time + idempotent: global t() is correct before children render
  // Screen readers pick their voice from it, and a page still marked `en` gets a browser offer to translate
  // copy that is already translated. The Portuguese copy is Brazilian, so it says so.
  useEffect(() => {
    document.documentElement.lang = locale === 'pt' ? 'pt-BR' : locale
  }, [locale])
  return (
    <RawIntlProvider value={getIntl(locale)} key={locale}>
      {children}
    </RawIntlProvider>
  )
}
