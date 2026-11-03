import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { Snowfall } from './Snowfall'

type Listener = () => void

function stubReducedMotion(reduce: boolean) {
  const listeners: Listener[] = []
  const query = {
    matches: reduce,
    addEventListener: (_: string, fn: Listener) => listeners.push(fn),
    removeEventListener: vi.fn()
  }
  vi.stubGlobal('matchMedia', () => query)
  return {
    set(next: boolean) {
      query.matches = next
      listeners.forEach(fn => fn())
    }
  }
}

beforeEach(() => {
  stubReducedMotion(false)
  // jsdom has no 2D context; the component bails out of drawing without one, which is all these specs need.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Snowfall', () => {
  it('renders a decorative canvas for the requested depth', () => {
    render(<Snowfall depth="front" />)
    const canvas = screen.getByTestId('snowfall-front')
    expect(canvas.tagName).toBe('CANVAS')
    expect(canvas).toHaveAttribute('data-depth', 'front')
    expect(canvas).toHaveAttribute('aria-hidden')
  })

  it('renders nothing for a reader who asked for less motion', () => {
    stubReducedMotion(true)
    render(<Snowfall depth="back" />)
    expect(screen.queryByTestId('snowfall-back')).toBeNull()
  })

  it('stops snowing when the reader turns reduced motion on', () => {
    const motion = stubReducedMotion(false)
    render(<Snowfall depth="back" />)
    expect(screen.getByTestId('snowfall-back')).toBeInTheDocument()
    act(() => motion.set(true))
    expect(screen.queryByTestId('snowfall-back')).toBeNull()
  })
})
