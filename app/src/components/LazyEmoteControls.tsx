import { lazy, Suspense, type ComponentProps } from 'react'
import type { EmoteControls as EmoteControlsComponent } from 'decentraland-ui2/dist/components/WearablePreview/EmoteControls'

// Play/pause + sound + scrub controls for the emote preview. Lazy so it (and its decentraland-ui2
// controller deps) only load on the item-detail page for emotes — never in the main bundle. Connects
// to the WearablePreview iframe by id (`wearablePreviewId`), so no manual controller wiring is needed.
const EmoteControlsLazy = lazy(() =>
  import('decentraland-ui2/dist/components/WearablePreview/EmoteControls').then(m => ({ default: m.EmoteControls }))
)

export function EmoteControls(props: ComponentProps<typeof EmoteControlsComponent>) {
  return (
    <Suspense fallback={null}>
      <EmoteControlsLazy {...props} />
    </Suspense>
  )
}
