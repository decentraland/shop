import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { PreviewRenderer } from '@dcl/schemas'
import { pickRenderer } from '~/lib/pickRenderer'

type Entry = Partial<PerformanceResourceTiming>

function setResources(entries: Entry[]) {
  vi.spyOn(performance, 'getEntriesByType').mockReturnValue(entries as PerformanceResourceTiming[])
}

// A single sizable transfer that yields ~`mbps` (duration fixed at 100ms).
function setMeasuredMbps(mbps: number) {
  setResources([{ transferSize: mbps * 12_500, duration: 100 }])
}

function setConnection(value: unknown) {
  Object.defineProperty(navigator, 'connection', { value, configurable: true })
}

function setDeviceMemory(gb: number | undefined) {
  Object.defineProperty(navigator, 'deviceMemory', { value: gb, configurable: true })
}

// The max-width breakpoint query matches on mobile-width viewports, not on wider desktop ones.
function setMobileViewport(isMobile: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({ matches: query.includes('max-width') ? isMobile : false })
  })
}

function setDevicePixelRatio(dpr: number | undefined) {
  Object.defineProperty(window, 'devicePixelRatio', { value: dpr, configurable: true })
}

function setHardwareConcurrency(cores: number | undefined) {
  Object.defineProperty(navigator, 'hardwareConcurrency', { value: cores, configurable: true })
}

beforeEach(() => {
  setMobileViewport(false)
  setDeviceMemory(8)
  // A standard (non-hi-DPI) desktop with plenty of cores — the GPU/DPR gate stays out of the way
  // unless a test opts into a hi-DPI + low-core combo.
  setDevicePixelRatio(1)
  setHardwareConcurrency(16)
  setResources([])
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  delete (navigator as { connection?: unknown }).connection
  delete (navigator as { deviceMemory?: unknown }).deviceMemory
  delete (navigator as { hardwareConcurrency?: unknown }).hardwareConcurrency
  delete (window as { matchMedia?: unknown }).matchMedia
  delete (window as { devicePixelRatio?: unknown }).devicePixelRatio
})

describe('pickRenderer', () => {
  it('always uses Babylon on mobile viewports', () => {
    setMobileViewport(true)
    setMeasuredMbps(100)
    expect(pickRenderer()).toEqual({ renderer: PreviewRenderer.BABYLON, reason: 'mobile' })
  })

  it('degrades to Babylon when saveData is on', () => {
    setMeasuredMbps(100)
    setConnection({ saveData: true })
    expect(pickRenderer()).toEqual({ renderer: PreviewRenderer.BABYLON, reason: 'save-data' })
  })

  describe('measured throughput uses the 10 Mbps bar', () => {
    it('prefers Unity from the fastest sizable transfer, ignoring small/cached entries', () => {
      setResources([
        { transferSize: 100_000, duration: 200 }, // 4 Mbps
        { transferSize: 50 * 12_500, duration: 100 }, // 50 Mbps ← peak
        { transferSize: 5_000, duration: 50 }, // too small, ignored
        { transferSize: 0, duration: 30 } // cached / cross-origin, ignored
      ])
      expect(pickRenderer()).toEqual({ renderer: PreviewRenderer.UNITY, reason: 'connection-ok' })
    })

    it('degrades to Babylon below 10 Mbps', () => {
      setMeasuredMbps(8)
      expect(pickRenderer()).toEqual({ renderer: PreviewRenderer.BABYLON, reason: 'slow-connection' })
    })
  })

  describe('browser downlink uses the lower 4 Mbps bar when nothing is measurable', () => {
    it('prefers Unity at or above 4 Mbps', () => {
      setConnection({ downlink: 5 })
      expect(pickRenderer()).toEqual({ renderer: PreviewRenderer.UNITY, reason: 'connection-ok' })
    })

    it('degrades to Babylon below 4 Mbps', () => {
      setConnection({ downlink: 3 })
      expect(pickRenderer()).toEqual({ renderer: PreviewRenderer.BABYLON, reason: 'slow-connection' })
    })
  })

  it('stays optimistic (Unity) when no bandwidth signal is available', () => {
    expect(pickRenderer()).toEqual({ renderer: PreviewRenderer.UNITY, reason: 'optimistic-default' })
  })

  it('degrades to Babylon on low-memory devices', () => {
    setMeasuredMbps(100)
    setDeviceMemory(2)
    expect(pickRenderer()).toEqual({ renderer: PreviewRenderer.BABYLON, reason: 'low-device-memory' })
  })

  it('does not disqualify when deviceMemory is unavailable', () => {
    setMeasuredMbps(50)
    setDeviceMemory(undefined)
    expect(pickRenderer().renderer).toBe(PreviewRenderer.UNITY)
  })

  describe('GPU/DPR gate', () => {
    it('degrades to Babylon on a hi-DPI screen with a modest core count', () => {
      setMeasuredMbps(100)
      setDevicePixelRatio(2)
      setHardwareConcurrency(4)
      expect(pickRenderer()).toEqual({ renderer: PreviewRenderer.BABYLON, reason: 'gpu-capability' })
    })

    it('keeps Unity on a hi-DPI screen backed by plenty of cores', () => {
      setMeasuredMbps(100)
      setDevicePixelRatio(3)
      setHardwareConcurrency(16)
      expect(pickRenderer().renderer).toBe(PreviewRenderer.UNITY)
    })

    it('keeps Unity on a standard-DPI screen even with a modest core count', () => {
      setMeasuredMbps(100)
      setDevicePixelRatio(1)
      setHardwareConcurrency(4)
      expect(pickRenderer().renderer).toBe(PreviewRenderer.UNITY)
    })

    it('does not disqualify when devicePixelRatio is unavailable', () => {
      setMeasuredMbps(100)
      setDevicePixelRatio(undefined)
      setHardwareConcurrency(4)
      expect(pickRenderer().renderer).toBe(PreviewRenderer.UNITY)
    })

    it('does not disqualify when hardwareConcurrency is unavailable', () => {
      setMeasuredMbps(100)
      setDevicePixelRatio(3)
      setHardwareConcurrency(undefined)
      expect(pickRenderer().renderer).toBe(PreviewRenderer.UNITY)
    })
  })

  describe('env override', () => {
    it('forces Babylon when VITE_PREVIEW_RENDERER=babylon, ignoring a fast desktop link', () => {
      vi.stubEnv('VITE_PREVIEW_RENDERER', 'babylon')
      setMeasuredMbps(100)
      setDeviceMemory(16)
      expect(pickRenderer()).toEqual({ renderer: PreviewRenderer.BABYLON, reason: 'env-override' })
    })

    it('leaves the device/connection logic intact when the override is unset', () => {
      setMeasuredMbps(100)
      setDeviceMemory(16)
      // MODE is 'test' here, so the production default does not kick in — the real logic still runs.
      expect(pickRenderer().renderer).toBe(PreviewRenderer.UNITY)
    })
  })

  describe('production override handling', () => {
    it('runs the device/connection heuristic in a non-test build when the override is unset', () => {
      vi.stubEnv('MODE', 'production')
      setMeasuredMbps(100)
      setDeviceMemory(16)
      expect(pickRenderer()).toEqual({ renderer: PreviewRenderer.UNITY, reason: 'connection-ok' })
    })

    it('treats an empty override the same as unset', () => {
      vi.stubEnv('MODE', 'production')
      vi.stubEnv('VITE_PREVIEW_RENDERER', '')
      setMeasuredMbps(100)
      setDeviceMemory(16)
      expect(pickRenderer()).toEqual({ renderer: PreviewRenderer.UNITY, reason: 'connection-ok' })
    })

    it('falls back to Babylon in a non-test build when the override value is unrecognized', () => {
      vi.stubEnv('MODE', 'production')
      vi.stubEnv('VITE_PREVIEW_RENDERER', 'webgpu')
      setMeasuredMbps(100)
      setDeviceMemory(16)
      expect(pickRenderer()).toEqual({ renderer: PreviewRenderer.BABYLON, reason: 'default-babylon' })
    })

    it('runs the device/connection heuristic when VITE_PREVIEW_RENDERER=unity', () => {
      vi.stubEnv('MODE', 'production')
      vi.stubEnv('VITE_PREVIEW_RENDERER', 'unity')
      setMeasuredMbps(100)
      setDeviceMemory(16)
      expect(pickRenderer().renderer).toBe(PreviewRenderer.UNITY)
    })

    it('still honours VITE_PREVIEW_RENDERER=babylon in a non-test build', () => {
      vi.stubEnv('MODE', 'production')
      vi.stubEnv('VITE_PREVIEW_RENDERER', 'babylon')
      expect(pickRenderer()).toEqual({ renderer: PreviewRenderer.BABYLON, reason: 'env-override' })
    })
  })
})
