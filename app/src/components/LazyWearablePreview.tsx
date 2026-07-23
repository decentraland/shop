import { lazy, Suspense, useState, type ComponentProps } from 'react'
import { PreviewRenderer, PreviewUnityMode } from '@dcl/schemas'
import type { WearablePreview as WearablePreviewComponent } from 'decentraland-ui2/dist/components/WearablePreview'
import { pickRenderer } from '~/lib/pickRenderer'
import { track } from '~/lib/analytics'

// The 3D preview iframe + its controller/schema deps only matter on hover (cards) and the detail
// page, so load them on demand instead of in the initial bundle. The type import is erased at build
// time, so this module doesn't pull decentraland-ui2 into the entry chunk.
const WearablePreviewLazy = lazy(() =>
  import('decentraland-ui2/dist/components/WearablePreview').then(m => ({
    default: m.WearablePreview
  }))
)

type Props = ComponentProps<typeof WearablePreviewComponent> & {
  // Reports the renderer actually in use, so callers can hide overlay controls Unity already provides.
  onRenderer?: (renderer: PreviewRenderer) => void
}

// Resolves the mount renderer decision (final for the component's life): tracks a Babylon fallback once —
// except the by-design, high-volume mobile case — and returns whether to attempt Unity.
function resolveUnityRenderer(unity: boolean, id?: string): boolean {
  if (!unity) return false
  const decision = pickRenderer()
  if (decision.renderer === PreviewRenderer.BABYLON && decision.reason !== 'mobile') {
    track('Shop Preview Renderer Fallback', { reason: decision.reason, preview_id: id ?? null })
  }
  return decision.renderer === PreviewRenderer.UNITY
}

/**
 * Lazy-loaded wearable/avatar preview. `unity` is a BEST-EFFORT request: Unity is used only when the
 * runtime conditions are met (see `lib/pickRenderer`), otherwise Babylon — and `unityMode=marketplace`
 * is sent when Unity is used. Omitting `unity` (default) always uses Babylon.
 */
export function WearablePreview({
  unity = false,
  unityMode = PreviewUnityMode.MARKETPLACE,
  onError,
  onLoad,
  onRenderer,
  ...props
}: Props) {
  const [shouldUseUnity, setShouldUseUnity] = useState(() => resolveUnityRenderer(unity, props.id))

  return (
    <Suspense fallback={null}>
      <WearablePreviewLazy
        {...props}
        unity={shouldUseUnity}
        unityMode={shouldUseUnity ? unityMode : undefined}
        onLoad={reported => {
          // Unity-aware builds report which renderer they used; legacy/Babylon-only builds don't.
          // Default to Babylon when absent so overlay controls appear for non-Unity previews.
          onRenderer?.(reported ?? PreviewRenderer.BABYLON)
          onLoad?.(reported)
        }}
        onError={error => {
          setShouldUseUnity(false)
          onRenderer?.(PreviewRenderer.BABYLON)
          onError?.(error)
        }}
      />
    </Suspense>
  )
}
