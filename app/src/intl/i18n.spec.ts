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
    expect(t('nav.getCredits', { currency: 'credits' })).toBe('Get credits')
    setActiveLocale('es')
    expect(t('nav.getCredits', { currency: 'créditos' })).toBe('Conseguir créditos')
  })

  it('falls back to the key id for a missing message', () => {
    expect(t('does.not.exist')).toBe('does.not.exist')
  })
})
