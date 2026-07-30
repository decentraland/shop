import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// detect() runs once at module import, so each test re-imports a fresh store to exercise a
// different detection branch.
const loadStore = async () => (await import('~/store/locale')).useLocale

beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
  window.history.replaceState(null, '', '/')
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('when detecting the initial locale', () => {
  it('should honor a supported ?lang= override above everything else', async () => {
    window.history.replaceState(null, '', '/?lang=es')
    localStorage.setItem('shop:locale', 'en')
    const useLocale = await loadStore()
    expect(useLocale.getState().locale).toBe('es')
  })

  it('should fall back to the saved choice when there is no override', async () => {
    localStorage.setItem('shop:locale', 'es')
    const useLocale = await loadStore()
    expect(useLocale.getState().locale).toBe('es')
  })

  it('should fall back to the browser language when nothing is saved', async () => {
    vi.stubGlobal('navigator', { language: 'es-MX' })
    const useLocale = await loadStore()
    expect(useLocale.getState().locale).toBe('es')
  })

  it('should ignore an unsupported ?lang= / saved / browser value and default to English', async () => {
    window.history.replaceState(null, '', '/?lang=fr')
    localStorage.setItem('shop:locale', 'fr')
    vi.stubGlobal('navigator', { language: 'fr-FR' })
    const useLocale = await loadStore()
    expect(useLocale.getState().locale).toBe('en')
  })

  it('should default to English when storage access throws (restricted mode)', async () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    try {
      const useLocale = await loadStore()
      expect(useLocale.getState().locale).toBe('en')
    } finally {
      spy.mockRestore()
    }
  })
})

describe('when changing the locale', () => {
  it('should update the store and persist the choice', async () => {
    const useLocale = await loadStore()
    useLocale.getState().setLocale('es')
    expect(useLocale.getState().locale).toBe('es')
    expect(localStorage.getItem('shop:locale')).toBe('es')
  })

  it('should still switch in-memory when persisting fails (private mode / quota)', async () => {
    const useLocale = await loadStore()
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    try {
      useLocale.getState().setLocale('es')
    } finally {
      spy.mockRestore()
    }
    expect(useLocale.getState().locale).toBe('es')
  })
})
