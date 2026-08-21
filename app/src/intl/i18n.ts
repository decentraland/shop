import type { ReactNode } from 'react'
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
  en: flatten(en),
  es: flatten(es)
}

const cache = createIntlCache()
const intls: Partial<Record<Locale, IntlShape>> = {}
export function getIntl(locale: Locale): IntlShape {
  if (!intls[locale]) {
    intls[locale] = createIntl({ locale, defaultLocale: 'en', messages: MESSAGES[locale], onError: () => {} }, cache)
  }
  return intls[locale]
}

let active: IntlShape = getIntl('en')
export function setActiveLocale(locale: Locale): void {
  active = getIntl(locale)
}

// Localized string for a key. Interpolation: t('x.y', { name }). Missing keys fall back to the id.
export function t(id: string, values?: Record<string, string | number>): string {
  return active.formatMessage({ id }, values)
}

/**
 * The same lookup, for a message that has to render an ELEMENT inside the sentence.
 *
 * `t()` returns a string, so decorating a single word — putting the MANA mark against the word MANA — used
 * to mean splitting the message in two and rendering the icon between the halves. That silently assumes
 * every language keeps the word in the same place, and ours do not: English says "still using MANA
 * pricing", Spanish says "precios en MANA", where it falls at the END. A positional split gets one of them
 * wrong by construction.
 *
 * So the message keeps the word and marks it up — `still using <mana>MANA</mana> pricing` — and the caller
 * passes a function per tag. The tag travels with the word through translation, wherever it lands.
 *
 * Returns a ReactNode, so it is JSX-only; `t()` stays the answer everywhere a plain string is wanted (an
 * aria-label, a title, a document title) because a node cannot go in those.
 *
 * The cast is deliberate. `formatMessage` is overloaded on whether any value is a chunk function, and it
 * infers that from the literal type of the values object — which a `Record` has already erased by the time
 * it gets here. The runtime contract is react-intl's own and unaffected; only the inference is lost.
 */
export function tNode(
  id: string,
  values: Record<string, string | number | ((chunks: ReactNode[]) => ReactNode)>
): ReactNode {
  return active.formatMessage({ id }, values as never) as ReactNode
}
