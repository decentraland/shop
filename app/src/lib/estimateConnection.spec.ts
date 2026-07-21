import { describe, it, expect, vi, afterEach } from 'vitest'
import { estimateConnection } from '~/lib/estimateConnection'

type Entry = Partial<PerformanceResourceTiming>

function mockResources(entries: Entry[]) {
  vi.spyOn(performance, 'getEntriesByType').mockReturnValue(entries as PerformanceResourceTiming[])
}

function setConnection(value: unknown) {
  Object.defineProperty(navigator, 'connection', { value, configurable: true })
}

afterEach(() => {
  vi.restoreAllMocks()
  delete (navigator as { connection?: unknown }).connection
})

describe('estimateConnection', () => {
  it('estimates Mbps from the fastest sizable same-origin transfer', () => {
    mockResources([
      { transferSize: 100_000, duration: 200 }, // 4 Mbps
      { transferSize: 200_000, duration: 100 }, // 16 Mbps ← peak
      { transferSize: 5_000, duration: 50 }, // too small, excluded
      { transferSize: 0, duration: 30 } // cached / cross-origin, excluded
    ])
    const r = estimateConnection()
    expect(r).toEqual({ mbps: 16, saveData: false, source: 'resource-timing' })
  })

  it('falls back to navigator.connection.downlink when no sizable transfers exist', () => {
    mockResources([{ transferSize: 1_000, duration: 10 }])
    setConnection({ downlink: 3 })
    expect(estimateConnection()).toEqual({ mbps: 3, saveData: false, source: 'network-info' })
  })

  it('returns null mbps when neither signal is available', () => {
    mockResources([])
    expect(estimateConnection()).toEqual({ mbps: null, saveData: false, source: 'none' })
  })

  it('reports saveData from the connection regardless of the estimate source', () => {
    mockResources([{ transferSize: 200_000, duration: 100 }])
    setConnection({ saveData: true, downlink: 50 })
    const r = estimateConnection()
    expect(r.saveData).toBe(true)
    expect(r.source).toBe('resource-timing')
  })
})
