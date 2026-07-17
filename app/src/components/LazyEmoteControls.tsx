import { lazy, Suspense, type ComponentProps } from 'react'
import type { EmoteControls as EmoteControlsComponent } from 'decentraland-ui2/dist/components/WearablePreview/EmoteControls'

// Play/pause + sound + scrub controls for the emote preview. Lazy so it (and its decentraland-ui2
// controller deps) only load on the item-detail page for emotes — never in the main bundle. Connects
// to the WearablePreview iframe by id (`wearablePreviewId`), so no manual controller wiring is needed.
//
// Unlike the rest of the shop (plain CSS) and unlike WearablePreview/Navbar (ui2 components that use
// only STATIC styled objects), EmoteControls' styled components read `theme.spacing()` from emotion's
// theme context. The shop mounts no MUI/emotion ThemeProvider, so that context is the empty `{}`
// default and `theme.spacing` is undefined → the whole PDP crashes ("e.spacing is not a function").
// Fix: wrap ONLY this subtree in the decentraland-ui2 `light` theme via MUI's
// Experimental_CssVarsProvider — the SAME provider ui2's own DclThemeProvider uses. The ui2 theme is
// a CSS-vars (extendTheme) theme: it must be mounted through CssVarsProvider so MUI resolves its color
// scheme / `palette.mode` / `vars` (a plain emotion or MUI ThemeProvider leaves those undefined and
// the inner MUI Button then throws "reading 'mode'"). CssVarsProvider populates both the MUI theme
// context and emotion's, so EmoteControls' `theme.spacing()` styled parts and its MUI Button both
// render. We deliberately do NOT use DclThemeProvider itself: it also renders <CssBaseline/>, whose
// global resets would clobber the shop's own CSS. Provider + theme are lazy-loaded alongside
// EmoteControls, so none of the MUI theme machinery leaks into any other chunk.
const EmoteControlsLazy = lazy(async () => {
  const [{ EmoteControls }, { Experimental_CssVarsProvider: CssVarsProvider }, { light: dclTheme }] = await Promise.all([
    import('decentraland-ui2/dist/components/WearablePreview/EmoteControls'),
    import('@mui/material/styles'),
    import('decentraland-ui2/dist/theme')
  ])
  return {
    default: (props: ComponentProps<typeof EmoteControlsComponent>) => (
      <CssVarsProvider theme={dclTheme}>
        <EmoteControls {...props} />
      </CssVarsProvider>
    )
  }
})

export function EmoteControls(props: ComponentProps<typeof EmoteControlsComponent>) {
  return (
    <Suspense fallback={null}>
      <EmoteControlsLazy {...props} />
    </Suspense>
  )
}
