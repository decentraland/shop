import { lazy, Suspense, useState, type ComponentProps } from 'react'
import { PreviewRenderer, PreviewUnityMode } from '@dcl/schemas'
import type { WearablePreview as WearablePreviewComponent } from 'decentraland-ui2/dist/components/WearablePreview'
import { pickRenderer } from '~/lib/pickRenderer'

// The 3D preview iframe + its controller/schema deps only matter on hover (cards) and the detail
// page, so load them on demand instead of in the initial bundle. The type import is erased at build
// time, so this module doesn't pull decentraland-ui2 into the entry chunk.
const WearablePreviewLazy = lazy(() =>
  import('decentraland-ui2/dist/components/WearablePreview').then(m => ({
    default: m.WearablePreview
  }))
)

type Props = ComponentProps<typeof WearablePreviewComponent>

/**
 * Lazy-loaded wearable/avatar preview.
 *
 * `unity` is a BEST-EFFORT request, not a guarantee: when `true` we render the higher-fidelity Unity
 * renderer only if runtime conditions are met (see `lib/pickRenderer`); otherwise — or on a Unity load
 * error — we transparently fall back to Babylon even though `unity={true}` was passed. When Unity is
 * actually used we also send `unityMode=marketplace`. Omitting `unity` (default) always uses Babylon.
 */
export function WearablePreview({ unity = false, unityMode = PreviewUnityMode.MARKETPLACE, onError, ...props }: Props) {
  const [shouldUseUnity, setShouldUseUnity] = useState(() => unity && pickRenderer().renderer === PreviewRenderer.UNITY)

  return (
    <Suspense fallback={null}>
      <WearablePreviewLazy
        {...props}
        unity={shouldUseUnity}
        unityMode={unityMode}
        onError={error => {
          setShouldUseUnity(false)
          onError?.(error)
        }}
      />
    </Suspense>
  )
}
