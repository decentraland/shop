import { useQuery } from '@tanstack/react-query'

import { FeatureFlag, getIsFeatureEnabled } from '~/lib/featureFlags'

/**
 * Whether the wearable preview may use the Unity renderer, and whether that answer is known yet.
 *
 * `enabled` fails closed: loading, an unreachable flag service and an absent flag all read `false`, which
 * lands on Babylon — the renderer that works everywhere.
 *
 * `pending` is separate because the two are not interchangeable at mount: a preview picks its renderer once
 * and switching later reloads the iframe, so a caller that renders before the flag resolves would load a
 * Babylon scene and throw it away.
 */
export function useUnityWearablePreview(): { enabled: boolean; pending: boolean } {
  const { data, isPending } = useQuery({
    queryKey: ['feature-flag', 'unity-wearable-preview'],
    queryFn: () => getIsFeatureEnabled(FeatureFlag.UNITY_WEARABLE_PREVIEW),
    // The lib caches for 60s behind this; keeping react-query's window in step avoids two competing TTLs.
    staleTime: 60_000,
    retry: 1
  })

  return { enabled: data === true, pending: isPending }
}
