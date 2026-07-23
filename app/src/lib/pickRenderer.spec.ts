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

beforeEach(() => {
  setMobileViewport(false)
  setDeviceMemory(8)
  setResources([])
})

afterEach(() => {
  vi.restoreAllMocks()
  delete (navigator as { connection?: unknown }).connection
  delete (navigator as { deviceMemory?: unknown }).deviceMemory
  delete (window as { matchMedia?: unknown }).matchMedia
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
})
