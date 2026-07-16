import { createIntl, createIntlCache, type IntlShape } from 'react-intl'
import en from './en.json'
import es from './es.json'

// react-intl backs our i18n. We expose a plain `t('a.b.c')` (like the marketplace) on top of it so
// converting strings is a simple wrap — no hook needed at every call site. `t()` reads a module-level
// "active" intl that <I18nProvider> keeps in sync with the chosen locale; it also works BEFORE/without
// a provider (defaults to English), which keeps unit tests that assert English strings green.

export const LOCALES = ['en', 'es'] as const
export type Locale = (typeof LOCALES)[number]
export const LOCALE_LABELS: Record<Locale, string> = { en: 'English', es: 'Español' }

// react-intl wants a FLAT { 'a.b.c': 'msg' } map; we author nested JSON for readability and flatten
// it once at load.
function flatten(obj: Record<string, unknown>, prefix = '', out: Record<string, string> = {}): Record<string, string> {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v as Record<string, unknown>, key, out)
    else out[key] = String(v)
  }
  return out
}

export const MESSAGES: Record<Locale, Record<string, string>> = {
  en: flatten(en as Record<string, unknown>),
  es: flatten(es as Record<string, unknown>)
}

const cache = createIntlCache()
const intls: Partial<Record<Locale, IntlShape>> = {}
export function getIntl(locale: Locale): IntlShape {
  if (!intls[locale]) {
    intls[locale] = createIntl({ locale, defaultLocale: 'en', messages: MESSAGES[locale], onError: () => {} }, cache)
  }
  return intls[locale]!
}

let active: IntlShape = getIntl('en')
export function setActiveLocale(locale: Locale): void {
  active = getIntl(locale)
}

// Localized string for a key. Interpolation: t('x.y', { name }). Missing keys fall back to the id.
export function t(id: string, values?: Record<string, string | number>): string {
  return active.formatMessage({ id }, values) as string
}
