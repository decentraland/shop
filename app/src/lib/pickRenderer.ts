import { PreviewRenderer } from '@dcl/schemas'
import { breakpoints } from '~/styles/theme'

// Benchmark: Unity ~2.8s at ~300Mbps vs ~15.7s at ~4Mbps — require a comfortable link for the big bundle.
export const UNITY_MIN_MBPS = 10
// navigator.connection.downlink is a coarse browser estimate, capped differently than a real transfer,
// so it gets its own lower, non-comparable bar.
export const UNITY_MIN_DOWNLINK_MBPS = 4
export const UNITY_MIN_DEVICE_MEMORY = 4 // in GB

// Transfers smaller than this are dominated by latency/slow-start and skew the throughput estimate.
const MIN_SAMPLE_BYTES = 30_000

export type RendererReason =
  'mobile' | 'save-data' | 'slow-connection' | 'low-device-memory' | 'connection-ok' | 'optimistic-default'

export type RendererDecision = { renderer: PreviewRenderer; reason: RendererReason }

type NavigatorConnection = { downlink?: number; saveData?: boolean }

/**
 * Returns the navigator.connection object, if available.
 * Note: navigator.connection is not available in all browsers, and its properties may be undefined.
 */
function connection(): NavigatorConnection | undefined {
  if (typeof navigator === 'undefined') return undefined
  return (navigator as unknown as { connection?: NavigatorConnection }).connection
}

/**
 * Returns the device memory in GB, if available.
 * Note: deviceMemory is not available in all browsers.
 */
function deviceMemory(): number | undefined {
  if (typeof navigator === 'undefined') return undefined
  return (navigator as unknown as { deviceMemory?: number }).deviceMemory
}

// theme.ts `mobile` = 768px; Unity's heavier runtime is reserved for wider (desktop) viewports.
function isMobile(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia(`(max-width: ${breakpoints.mobile}px)`).matches
}

// Peak downlink (Mbps) from same-origin assets already fetched, so no extra request. transferSize is 0
// for cache hits and cross-origin-without-TAO (both dropped); parallel loads only depress a sample, so
// the max is the least-contended estimate. null when nothing usable has loaded yet.
function measuredMbps(): number | null {
  if (typeof performance === 'undefined' || typeof performance.getEntriesByType !== 'function') return null
  let best: number | null = null
  for (const e of performance.getEntriesByType('resource') as PerformanceResourceTiming[]) {
    if (e.transferSize >= MIN_SAMPLE_BYTES && e.duration > 0) {
      const mbps = (e.transferSize * 8) / 1e6 / (e.duration / 1000)
      if (best === null || mbps > best) best = mbps
    }
  }
  return best
}

/**
 * Chooses the item-preview renderer. Prefers Unity (higher fidelity), degrading to Babylon on mobile,
 * data-saver, a slow link, or low memory; unknown signals stay optimistic.
 */
export function pickRenderer(): RendererDecision {
  const babylon = (reason: RendererReason): RendererDecision => ({ renderer: PreviewRenderer.BABYLON, reason })

  if (isMobile()) return babylon('mobile')

  const conn = connection()
  if (conn?.saveData) return babylon('save-data')

  // A real transfer measurement wins; only fall back to the browser's downlink estimate when we have none.
  const measured = measuredMbps()
  const downlink = conn?.downlink
  if (measured !== null && measured < UNITY_MIN_MBPS) return babylon('slow-connection')
  else if (measured === null && typeof downlink === 'number' && downlink > 0 && downlink < UNITY_MIN_DOWNLINK_MBPS) {
    return babylon('slow-connection')
  }

  const mem = deviceMemory()
  if (mem !== undefined && mem < UNITY_MIN_DEVICE_MEMORY) return babylon('low-device-memory')

  const hasReading = measured !== null || typeof downlink === 'number'
  return { renderer: PreviewRenderer.UNITY, reason: hasReading ? 'connection-ok' : 'optimistic-default' }
}
