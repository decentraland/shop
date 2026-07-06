import { Experimental_CssVarsProvider as CssVarsProvider } from '@mui/material/styles'
import { Footer } from 'decentraland-ui2/dist/components/Footer'
import type { FooterProps, Language, SupportedLanguage } from 'decentraland-ui2/dist/components/Footer'
// The UI2 Footer's styled components read the MUI theme (theme.palette.*), so it must sit under a
// theme provider or it throws "Cannot read properties of undefined (reading 'background')". We use
// MUI's CssVarsProvider directly with the DCL `light` theme — NOT decentraland-ui2's ThemeProvider,
// which also renders <CssBaseline/> and would inject global body resets (font/bg) across the whole
// shop. This file is only reached via lazy() (see ShopFooter), so MUI stays out of the entry chunk.
import { light } from 'decentraland-ui2/dist/theme'

// Only the languages the Shop ships. Our locale values ('en' | 'es') are exactly the UI2
// SupportedLanguage values, so the cast is safe.
const LANGUAGES: Language[] = [
  { code: 'en' as SupportedLanguage, name: 'English', flag: '🇺🇸' },
  { code: 'es' as SupportedLanguage, name: 'Español', flag: '🇪🇸' }
]

export default function ShopFooterInner({
  locale,
  onChange
}: {
  locale: string
  onChange: (code: string) => void
}) {
  const onLanguageChange: NonNullable<FooterProps['onLanguageChange']> = code => onChange(code)
  return (
    <CssVarsProvider theme={light}>
      <Footer languages={LANGUAGES} selectedLanguage={locale as SupportedLanguage} onLanguageChange={onLanguageChange} />
    </CssVarsProvider>
  )
}
