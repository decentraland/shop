import { PreviewRenderer } from '@dcl/schemas'
import { breakpoints } from '~/styles/theme'

// Benchmark: Unity ~2.8s at ~300Mbps vs ~15.7s at ~4Mbps — require a comfortable link for the big bundle.
export const UNITY_MIN_MBPS = 10
export const UNITY_MIN_DEVICE_MEMORY = 4 // in GB

// A hi-DPI screen renders Unity at full devicePixelRatio (there's no DPR cap yet), which is GPU-heavy.
// Pair a high DPR with a modest logical-core count as a proxy for a mid-tier integrated/mobile GPU and
// fall back to Babylon — so a Retina/4K laptop with a middling GPU doesn't get full-DPR Unity.
export const UNITY_MIN_DPR = 2
export const UNITY_HIDPI_MIN_HW_CONCURRENCY = 8 // need at least this many cores to pair with a hi-DPI screen

export type RendererReason =
  | 'mobile'
  | 'save-data'
  | 'slow-connection'
  | 'low-device-memory'
  | 'gpu-capability'
  | 'connection-ok'
  | 'optimistic-default'
  | 'env-override'
  | 'default-babylon'

export type RendererDecision = { renderer: PreviewRenderer; reason: RendererReason }

type NavigatorConnection = { saveData?: boolean }

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

/**
 * Logical CPU cores, if reported. A coarse GPU-tier proxy (paired with devicePixelRatio below).
 */
function hardwareConcurrency(): number | undefined {
  if (typeof navigator === 'undefined') return undefined
  return (navigator as unknown as { hardwareConcurrency?: number }).hardwareConcurrency
}

/**
 * The device pixel ratio, if available. Higher means more pixels for Unity to render each frame.
 */
function devicePixelRatio(): number | undefined {
  if (typeof window === 'undefined') return undefined
  return typeof window.devicePixelRatio === 'number' ? window.devicePixelRatio : undefined
}

// theme.ts `mobile` = 768px; Unity's heavier runtime is reserved for wider (desktop) viewports.
function isMobile(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia(`(max-width: ${breakpoints.mobile}px)`).matches
}

/**
 * Chooses the item-preview renderer. Prefers Unity (higher fidelity), degrading to Babylon on mobile,
 * data-saver, a slow link, or low memory; unknown signals stay optimistic. `measuredMbps` is the
 * `lib/connectionSpeed` probe result, `null` when it has not run or could not.
 */
export function pickRenderer(measuredMbps: number | null = null): RendererDecision {
  const babylon = (reason: RendererReason): RendererDecision => ({ renderer: PreviewRenderer.BABYLON, reason })

  // `VITE_PREVIEW_RENDERER=babylon` forces the lightweight preview; 'unity' (or unset) runs the
  // device/connection heuristic below. Any other set value falls back to Babylon in real builds as
  // a safe default (mode-gated so unit tests still exercise the heuristic).
  // TODO(follow-up): promote this to a RUNTIME per-env config knob (ui-env JSON) so the renderer can
  // be flipped per environment without a rebuild. Deferred here on purpose — it's blocked on in-flight
  // changes to `config/*` owned by other work; do not couple this switch to those files yet.
  const forced = import.meta.env.VITE_PREVIEW_RENDERER as string | undefined
  if (forced === 'babylon') return babylon('env-override')
  if (import.meta.env.MODE !== 'test' && forced && forced !== 'unity') return babylon('default-babylon')

  if (isMobile()) return babylon('mobile')

  if (connection()?.saveData) return babylon('save-data')
  if (measuredMbps !== null && measuredMbps < UNITY_MIN_MBPS) return babylon('slow-connection')

  const mem = deviceMemory()
  if (mem !== undefined && mem < UNITY_MIN_DEVICE_MEMORY) return babylon('low-device-memory')

  // GPU/DPR gate: a hi-DPI screen (≥ 2x) paired with a modest core count is a good proxy for a mid-tier
  // GPU that would struggle to drive full-DPR Unity. Only disqualifies when BOTH signals are known —
  // an unknown DPR or core count stays optimistic (like deviceMemory above).
  const dpr = devicePixelRatio()
  const cores = hardwareConcurrency()
  if (dpr !== undefined && dpr >= UNITY_MIN_DPR && cores !== undefined && cores < UNITY_HIDPI_MIN_HW_CONCURRENCY) {
    return babylon('gpu-capability')
  }

  return { renderer: PreviewRenderer.UNITY, reason: measuredMbps !== null ? 'connection-ok' : 'optimistic-default' }
}
