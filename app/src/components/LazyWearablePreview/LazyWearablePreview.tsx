import { lazy, Suspense, useState, type ComponentProps } from 'react'
import { ChainId, PreviewRenderer, PreviewUnityMode } from '@dcl/schemas'
import type { WearablePreview as WearablePreviewComponent } from 'decentraland-ui2/dist/components/WearablePreview'
import { pickRenderer } from '~/lib/pickRenderer'
import { track } from '~/lib/analytics'
import { config } from '~/config'
import { useUnityWearablePreview } from '~/hooks/useUnityWearablePreview'
import { useMeasuredMbps } from '~/hooks/useMeasuredMbps'

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

// Reasons that are NOT capability fallbacks and would just spam analytics: the by-design, high-volume
// mobile case and the intentional Babylon kill-switch default (Unity off everywhere until aang perf caps ship).
const UNTRACKED_FALLBACK_REASONS = new Set(['mobile', 'default-babylon'])

// Resolves the mount renderer decision (final for the component's life): tracks a real Babylon capability
// fallback once (see UNTRACKED_FALLBACK_REASONS for the excluded cases) and returns whether to attempt Unity.
function resolveUnityRenderer(unity: boolean, measuredMbps: number | null, id?: string): boolean {
  if (!unity) return false
  const decision = pickRenderer(measuredMbps)
  if (decision.renderer === PreviewRenderer.BABYLON && !UNTRACKED_FALLBACK_REASONS.has(decision.reason)) {
    track('Shop Preview Renderer Fallback', { reason: decision.reason, preview_id: id ?? null })
  }
  return decision.renderer === PreviewRenderer.UNITY
}

/**
 * Lazy-loaded wearable/avatar preview. `unity` is a BEST-EFFORT request: Unity is used only when the
 * shared `unity-wearable-preview` flag is on AND the runtime conditions are met (see `lib/pickRenderer`),
 * otherwise Babylon — and `unityMode=marketplace` is sent when Unity is used. Omitting `unity` (default)
 * requests Unity (best-effort — gated by the feature flag and runtime capability checks).
 */
export function WearablePreview({ unity = true, ...props }: Props) {
  const flag = useUnityWearablePreview()
  const wantsUnity = unity && flag.enabled
  // The probe only runs when the link is what is left to decide: a phone, data saver or a device below the
  // bar has already settled on Babylon, and that visitor should not pay for the download.
  const link = useMeasuredMbps(wantsUnity && pickRenderer().renderer === PreviewRenderer.UNITY)

  // The renderer is decided once per mount (below), so rendering before the flag and the probe resolve would
  // mean loading a Babylon scene and replacing it a tick later. Nothing is shown for that window instead —
  // callers already cover it with their own loading state, and both are cached after the first preview.
  if (unity && (flag.pending || link.pending)) return null

  return <Preview unity={wantsUnity} measuredMbps={link.mbps} {...props} />
}

function Preview({
  unity = false,
  unityMode = PreviewUnityMode.MARKETPLACE,
  onError,
  onLoad,
  onRenderer,
  measuredMbps = null,
  ...props
}: Props & { measuredMbps?: number | null }) {
  const [shouldUseUnity, setShouldUseUnity] = useState(() => resolveUnityRenderer(unity, measuredMbps, props.id))
  const chainId: ChainId = config.chainId

  return (
    <Suspense fallback={null}>
      <WearablePreviewLazy
        dev={chainId === ChainId.MATIC_AMOY}
        peerUrl={config.peerUrl}
        marketplaceServerUrl={config.marketplaceServerUrl}
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
