import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { PreviewRenderer } from '@dcl/schemas'
import { pickRenderer } from '~/lib/pickRenderer'
import { estimateConnection, type ConnectionEstimate } from '~/lib/estimateConnection'

vi.mock('~/lib/estimateConnection', () => ({ estimateConnection: vi.fn() }))

const mockEstimate = (e: Partial<ConnectionEstimate>) =>
  vi.mocked(estimateConnection).mockReturnValue({ mbps: 100, saveData: false, source: 'resource-timing', ...e })

// hover:hover matches on desktop (precise pointer), never on mobile/touch.
function setDesktop(isDesktop: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({ matches: query.includes('hover: hover') ? isDesktop : false })
  })
}

function setWebGL2(available: boolean) {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(((type: string) =>
    type === 'webgl2' && available ? ({} as object) : null) as never)
}

function setDeviceMemory(gb: number | undefined) {
  Object.defineProperty(navigator, 'deviceMemory', { value: gb, configurable: true })
}

beforeEach(() => {
  setDesktop(true)
  setWebGL2(true)
  setDeviceMemory(8)
  mockEstimate({})
})

afterEach(() => {
  vi.restoreAllMocks()
  delete (navigator as { deviceMemory?: unknown }).deviceMemory
  delete (window as { matchMedia?: unknown }).matchMedia
})

describe('pickRenderer', () => {
  it('always uses Babylon on mobile, regardless of other signals', () => {
    setDesktop(false)
    mockEstimate({ mbps: 100 })
    expect(pickRenderer()).toEqual({ renderer: PreviewRenderer.BABYLON, reason: 'mobile' })
  })

  it('prefers Unity on desktop when connection and device clear the bar', () => {
    mockEstimate({ mbps: 50 })
    expect(pickRenderer()).toEqual({ renderer: PreviewRenderer.UNITY, reason: 'connection-ok' })
  })

  it('stays optimistic (Unity) on desktop when bandwidth is unknown', () => {
    mockEstimate({ mbps: null })
    expect(pickRenderer()).toEqual({ renderer: PreviewRenderer.UNITY, reason: 'optimistic-default' })
  })

  it('degrades to Babylon when saveData is on', () => {
    mockEstimate({ mbps: 100, saveData: true })
    expect(pickRenderer()).toEqual({ renderer: PreviewRenderer.BABYLON, reason: 'save-data' })
  })

  it('degrades to Babylon without WebGL2', () => {
    setWebGL2(false)
    expect(pickRenderer().reason).toBe('no-webgl2')
  })

  it('degrades to Babylon on low-memory devices', () => {
    setDeviceMemory(2)
    expect(pickRenderer()).toEqual({ renderer: PreviewRenderer.BABYLON, reason: 'low-device-memory' })
  })

  it('does not disqualify when deviceMemory is unavailable', () => {
    setDeviceMemory(undefined)
    mockEstimate({ mbps: 50 })
    expect(pickRenderer().renderer).toBe(PreviewRenderer.UNITY)
  })

  it('degrades to Babylon below the 10 Mbps bar', () => {
    mockEstimate({ mbps: 8 })
    expect(pickRenderer()).toEqual({ renderer: PreviewRenderer.BABYLON, reason: 'slow-connection' })
  })
})
