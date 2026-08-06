import { describe, it, expect, afterEach } from 'vitest'
import { t, setActiveLocale, MESSAGES } from './i18n'

afterEach(() => setActiveLocale('en')) // don't leak locale between tests

describe('i18n', () => {
  it('flattens nested JSON to dot keys', () => {
    expect(MESSAGES.en['nav.collectibles']).toBe('Collectibles')
    expect(MESSAGES.es['nav.collectibles']).toBe('Coleccionables')
  })

  it('t() returns English by default (no provider needed)', () => {
    expect(t('nav.overview')).toBe('Overview')
  })

  it('t() switches with the active locale', () => {
    setActiveLocale('es')
    expect(t('nav.overview')).toBe('Inicio')
  })

  it('interpolates values', () => {
    expect(t('nav.getCredits', { currency: 'credits' })).toBe('Buy credits')
    setActiveLocale('es')
    expect(t('nav.getCredits', { currency: 'créditos' })).toBe('Comprar créditos')
  })

  it('falls back to the key id for a missing message', () => {
    expect(t('does.not.exist')).toBe('does.not.exist')
  })

  // Parity guard: every locale must define exactly the same set of keys, so a string added in one
  // language can never ship missing in another (it would silently fall back to the raw key id).
  it('has identical key sets across all locales (en/es parity)', () => {
    const enKeys = Object.keys(MESSAGES.en).sort()
    const esKeys = Object.keys(MESSAGES.es).sort()
    const missingInEs = enKeys.filter(k => !(k in MESSAGES.es))
    const missingInEn = esKeys.filter(k => !(k in MESSAGES.en))
    expect(missingInEs, `keys missing in es: ${missingInEs.join(', ')}`).toEqual([])
    expect(missingInEn, `keys missing in en: ${missingInEn.join(', ')}`).toEqual([])
  })
})
