import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { usePreviewActive } from '~/hooks/usePreviewActive'

// Minimal IntersectionObserver stub that lets a test drive intersection changes.
let ioInstances: Array<{ trigger: (isIntersecting: boolean) => void; disconnect: () => void }>

class FakeIntersectionObserver {
  private cb: IntersectionObserverCallback
  constructor(cb: IntersectionObserverCallback) {
    this.cb = cb
    ioInstances.push({
      trigger: isIntersecting =>
        this.cb([{ isIntersecting } as IntersectionObserverEntry], this as unknown as IntersectionObserver),
      disconnect: vi.fn()
    })
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true })
  document.dispatchEvent(new Event('visibilitychange'))
}

beforeEach(() => {
  ioInstances = []
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('usePreviewActive', () => {
  it('starts active so an above-the-fold preview mounts immediately', () => {
    const { result } = renderHook(() => usePreviewActive<HTMLDivElement>())
    expect(result.current.active).toBe(true)
  })

  it('becomes inactive when the element scrolls off-screen and active again when it returns', () => {
    const el = document.createElement('div')
    // Assign the ref DURING render (before the mount effect) so the observer attaches to a real element.
    const { result } = renderHook(() => {
      const api = usePreviewActive<HTMLDivElement>()
      api.ref.current = el
      return api
    })
    expect(ioInstances).toHaveLength(1)
    act(() => ioInstances[0].trigger(false))
    expect(result.current.active).toBe(false)
    act(() => ioInstances[0].trigger(true))
    expect(result.current.active).toBe(true)
  })

  it('becomes inactive when the tab is hidden and active again when it is shown', () => {
    const { result } = renderHook(() => usePreviewActive<HTMLDivElement>())
    act(() => setVisibility('hidden'))
    expect(result.current.active).toBe(false)
    act(() => setVisibility('visible'))
    expect(result.current.active).toBe(true)
  })
})
