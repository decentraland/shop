import { PreviewRenderer } from '@dcl/schemas'
import { estimateConnection } from '~/lib/estimateConnection'

// The item preview PREFERS Unity (higher fidelity + accuracy) and degrades to Babylon when a condition
// is unmet. Policy:
//   - Mobile → always Babylon. Unity's heavy WebGL runtime is a poor fit for mobile hardware/networks.
//   - Desktop → attempt Unity only when the passive metrics clear the bar (fast enough link + enough
//     memory + WebGL2 + no data-saver); unknown signals stay optimistic (Unity).
// The preview app itself paints Babylon first and upgrades to Unity, so attempting Unity is never a
// blank wait; this gate is about not spending a heavy Unity download/runtime where it won't pay off.

// Minimum estimated downlink (Mbps) to attempt Unity on desktop. Benchmark: Unity ~2.8s at ~300Mbps vs
// ~15.7s at ~4Mbps — require a comfortable link before committing to the large WebGL bundle.
export const UNITY_MIN_MBPS = 10

// Minimum device memory (GB) to attempt Unity; below this the Unity WebGL runtime risks stalling/OOM.
// navigator.deviceMemory is coarse and Chromium-only — when absent it is NOT treated as a disqualifier.
export const UNITY_MIN_DEVICE_MEMORY = 4

export type RendererReason =
  | 'mobile'
  | 'save-data'
  | 'no-webgl2'
  | 'low-device-memory'
  | 'slow-connection'
  | 'connection-ok'
  | 'optimistic-default'

export type RendererDecision = {
  renderer: PreviewRenderer
  reason: RendererReason
}

// Mobile/touch devices lack a precise hover pointer; the app already uses this signal to gate
// hover-only affordances (see AssetCard). Treated as the desktop-vs-mobile split for the renderer.
function isMobile(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return !window.matchMedia('(hover: hover)').matches
}

function hasWebGL2(): boolean {
  if (typeof document === 'undefined') return true
  try {
    return !!document.createElement('canvas').getContext('webgl2')
  } catch {
    return false
  }
}

function deviceMemory(): number | undefined {
  if (typeof navigator === 'undefined') return undefined
  return (navigator as unknown as { deviceMemory?: number }).deviceMemory
}

export function pickRenderer(): RendererDecision {
  const babylon = (reason: RendererReason): RendererDecision => ({ renderer: PreviewRenderer.BABYLON, reason })

  if (isMobile()) return babylon('mobile')

  const { mbps, saveData } = estimateConnection()

  if (saveData) return babylon('save-data')
  if (!hasWebGL2()) return babylon('no-webgl2')

  const mem = deviceMemory()
  if (mem !== undefined && mem < UNITY_MIN_DEVICE_MEMORY) return babylon('low-device-memory')

  if (mbps !== null && mbps < UNITY_MIN_MBPS) return babylon('slow-connection')

  return { renderer: PreviewRenderer.UNITY, reason: mbps === null ? 'optimistic-default' : 'connection-ok' }
}
