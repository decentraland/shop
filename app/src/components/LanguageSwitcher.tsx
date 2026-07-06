import { useLocale } from '~/store/locale'
import { LOCALES, LOCALE_LABELS, t, type Locale } from '~/intl/i18n'

// Compact language picker in the sub-nav. Persists the choice (see store/locale) and switches the
// whole UI via <I18nProvider>.
export function LanguageSwitcher() {
  const locale = useLocale(s => s.locale)
  const setLocale = useLocale(s => s.setLocale)
  return (
    <select
      className="lang-switch"
      aria-label={t('nav.language')}
      value={locale}
      onChange={e => setLocale(e.target.value as Locale)}
    >
      {LOCALES.map(l => (
        <option key={l} value={l}>
          {LOCALE_LABELS[l]}
        </option>
      ))}
    </select>
  )
}
