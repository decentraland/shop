import { describe, it, expect, afterEach } from 'vitest'
import { act, render } from '@testing-library/react'
import { useLocale } from '~/store/locale'
import { I18nProvider } from './I18nProvider'
import { setActiveLocale } from './i18n'

afterEach(() => {
  useLocale.setState({ locale: 'en' })
  setActiveLocale('en')
})

describe('when the locale changes', () => {
  it('should mark the document with the active language', () => {
    render(<I18nProvider>content</I18nProvider>)
    expect(document.documentElement.lang).toBe('en')

    act(() => useLocale.setState({ locale: 'pt' }))

    expect(document.documentElement.lang).toBe('pt-BR')
  })
})
