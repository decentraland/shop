import { create } from 'zustand'
import { LOCALES, type Locale } from '~/intl/i18n'

const KEY = 'shop:locale'

// Pick the initial locale: ?lang= override → saved choice → browser language → English.
function detect(): Locale {
  try {
    const q = new URLSearchParams(window.location.search).get('lang')
    if (q && (LOCALES as readonly string[]).includes(q)) return q as Locale
    const saved = localStorage.getItem(KEY)
    if (saved && (LOCALES as readonly string[]).includes(saved)) return saved as Locale
    const nav = navigator.language?.slice(0, 2)
    if (nav && (LOCALES as readonly string[]).includes(nav)) return nav as Locale
  } catch {
    /* SSR / restricted storage → fall through to default */
  }
  return 'en'
}

type LocaleState = {
  locale: Locale
  setLocale: (locale: Locale) => void
}

export const useLocale = create<LocaleState>(set => ({
  locale: detect(),
  setLocale: locale => {
    try {
      localStorage.setItem(KEY, locale)
    } catch {
      /* ignore */
    }
    set({ locale })
  }
}))
