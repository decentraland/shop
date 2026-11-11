import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useNearViewport } from '~/hooks/useNearViewport'

let ioInstances: Array<{ trigger: (isIntersecting: boolean) => void; disconnect: ReturnType<typeof vi.fn> }>

class FakeIntersectionObserver {
  private cb: IntersectionObserverCallback
  disconnect = vi.fn()
  constructor(cb: IntersectionObserverCallback) {
    this.cb = cb
    ioInstances.push({
      trigger: isIntersecting =>
        this.cb([{ isIntersecting } as IntersectionObserverEntry], this as unknown as IntersectionObserver),
      disconnect: this.disconnect
    })
  }
  observe() {}
  unobserve() {}
}

function mount() {
  const el = document.createElement('iframe')
  return renderHook(() => {
    const api = useNearViewport<HTMLIFrameElement>()
    api.ref.current = el
    return api
  })
}

beforeEach(() => {
  ioInstances = []
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useNearViewport', () => {
  it('starts far, so nothing behind it is fetched on load', () => {
    const { result } = mount()
    expect(result.current.near).toBe(false)
  })

  // The latch is the whole point: the footer newsletter must not be torn down and rebuilt as the visitor
  // scrolls past it, which would discard a half-typed email address.
  it('latches on once near and stays near after scrolling away', () => {
    const { result } = mount()
    act(() => ioInstances[0].trigger(true))
    expect(result.current.near).toBe(true)
    act(() => ioInstances[0].trigger(false))
    expect(result.current.near).toBe(true)
    expect(ioInstances[0].disconnect).toHaveBeenCalled()
  })

  it('shows anyway when IntersectionObserver is unavailable', () => {
    vi.stubGlobal('IntersectionObserver', undefined)
    const { result } = mount()
    expect(result.current.near).toBe(true)
  })
})
