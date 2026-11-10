import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { PreviewRenderer } from '@dcl/schemas'
import { pickRenderer } from '~/lib/pickRenderer'

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
    expect(pickRenderer(100)).toEqual({ renderer: PreviewRenderer.BABYLON, reason: 'mobile' })
  })

  it('degrades to Babylon when saveData is on', () => {
    setConnection({ saveData: true })
    expect(pickRenderer(100)).toEqual({ renderer: PreviewRenderer.BABYLON, reason: 'save-data' })
  })

  describe('measured throughput', () => {
    it('prefers Unity at or above 10 Mbps', () => {
      expect(pickRenderer(10)).toEqual({ renderer: PreviewRenderer.UNITY, reason: 'connection-ok' })
    })

    it('degrades to Babylon below 10 Mbps', () => {
      expect(pickRenderer(8)).toEqual({ renderer: PreviewRenderer.BABYLON, reason: 'slow-connection' })
    })

    it('degrades to Babylon on a timed-out probe', () => {
      expect(pickRenderer(0)).toEqual({ renderer: PreviewRenderer.BABYLON, reason: 'slow-connection' })
    })

    it("ignores the browser's own downlink estimate", () => {
      setConnection({ downlink: 2.8 })
      expect(pickRenderer(50)).toEqual({ renderer: PreviewRenderer.UNITY, reason: 'connection-ok' })
      expect(pickRenderer(null)).toEqual({ renderer: PreviewRenderer.UNITY, reason: 'optimistic-default' })
    })
  })

  it('stays optimistic (Unity) when no bandwidth signal is available', () => {
    expect(pickRenderer()).toEqual({ renderer: PreviewRenderer.UNITY, reason: 'optimistic-default' })
  })

  it('degrades to Babylon on low-memory devices', () => {
    setDeviceMemory(2)
    expect(pickRenderer(100)).toEqual({ renderer: PreviewRenderer.BABYLON, reason: 'low-device-memory' })
  })

  it('does not disqualify when deviceMemory is unavailable', () => {
    setDeviceMemory(undefined)
    expect(pickRenderer(50).renderer).toBe(PreviewRenderer.UNITY)
  })

  describe('GPU/DPR gate', () => {
    it('degrades to Babylon on a hi-DPI screen with a modest core count', () => {
      setDevicePixelRatio(2)
      setHardwareConcurrency(4)
      expect(pickRenderer(100)).toEqual({ renderer: PreviewRenderer.BABYLON, reason: 'gpu-capability' })
    })

    it('keeps Unity on a hi-DPI screen backed by plenty of cores', () => {
      setDevicePixelRatio(3)
      setHardwareConcurrency(16)
      expect(pickRenderer(100).renderer).toBe(PreviewRenderer.UNITY)
    })

    it('keeps Unity on a standard-DPI screen even with a modest core count', () => {
      setDevicePixelRatio(1)
      setHardwareConcurrency(4)
      expect(pickRenderer(100).renderer).toBe(PreviewRenderer.UNITY)
    })

    it('does not disqualify when devicePixelRatio is unavailable', () => {
      setDevicePixelRatio(undefined)
      setHardwareConcurrency(4)
      expect(pickRenderer(100).renderer).toBe(PreviewRenderer.UNITY)
    })

    it('does not disqualify when hardwareConcurrency is unavailable', () => {
      setDevicePixelRatio(3)
      setHardwareConcurrency(undefined)
      expect(pickRenderer(100).renderer).toBe(PreviewRenderer.UNITY)
    })
  })

  describe('env override', () => {
    it('forces Babylon when VITE_PREVIEW_RENDERER=babylon, ignoring a fast desktop link', () => {
      vi.stubEnv('VITE_PREVIEW_RENDERER', 'babylon')
      setDeviceMemory(16)
      expect(pickRenderer(100)).toEqual({ renderer: PreviewRenderer.BABYLON, reason: 'env-override' })
    })

    it('leaves the device/connection logic intact when the override is unset', () => {
      setDeviceMemory(16)
      // MODE is 'test' here, so the production default does not kick in — the real logic still runs.
      expect(pickRenderer(100).renderer).toBe(PreviewRenderer.UNITY)
    })
  })

  describe('production override handling', () => {
    it('runs the device/connection heuristic in a non-test build when the override is unset', () => {
      vi.stubEnv('MODE', 'production')
      setDeviceMemory(16)
      expect(pickRenderer(100)).toEqual({ renderer: PreviewRenderer.UNITY, reason: 'connection-ok' })
    })

    it('treats an empty override the same as unset', () => {
      vi.stubEnv('MODE', 'production')
      vi.stubEnv('VITE_PREVIEW_RENDERER', '')
      setDeviceMemory(16)
      expect(pickRenderer(100)).toEqual({ renderer: PreviewRenderer.UNITY, reason: 'connection-ok' })
    })

    it('falls back to Babylon in a non-test build when the override value is unrecognized', () => {
      vi.stubEnv('MODE', 'production')
      vi.stubEnv('VITE_PREVIEW_RENDERER', 'webgpu')
      setDeviceMemory(16)
      expect(pickRenderer(100)).toEqual({ renderer: PreviewRenderer.BABYLON, reason: 'default-babylon' })
    })

    it('runs the device/connection heuristic when VITE_PREVIEW_RENDERER=unity', () => {
      vi.stubEnv('MODE', 'production')
      vi.stubEnv('VITE_PREVIEW_RENDERER', 'unity')
      setDeviceMemory(16)
      expect(pickRenderer(100).renderer).toBe(PreviewRenderer.UNITY)
    })

    it('still honours VITE_PREVIEW_RENDERER=babylon in a non-test build', () => {
      vi.stubEnv('MODE', 'production')
      vi.stubEnv('VITE_PREVIEW_RENDERER', 'babylon')
      expect(pickRenderer()).toEqual({ renderer: PreviewRenderer.BABYLON, reason: 'env-override' })
    })
  })
})
