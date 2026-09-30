import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { BatBurst } from './BatBurst'

function setReducedMotion(reduce: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce && query.includes('reduce'),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  }))
}

beforeEach(() => {
  vi.useFakeTimers()
  setReducedMotion(false)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('BatBurst', () => {
  it('scatters a handful of bats on mount', () => {
    render(<BatBurst />)

    expect(screen.getByTestId('bat-burst').querySelectorAll('img')).toHaveLength(7)
  })

  it('tells the caller to unmount it only once the LAST bat has landed', () => {
    const onDone = vi.fn()
    render(<BatBurst onDone={onDone} />)

    act(() => void vi.advanceTimersByTime(900))
    expect(onDone).not.toHaveBeenCalled()

    act(() => void vi.advanceTimersByTime(400))
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('is not restarted by a caller that passes a fresh onDone on every render', () => {
    const onDone = vi.fn()
    const { rerender } = render(<BatBurst onDone={() => onDone()} />)

    act(() => void vi.advanceTimersByTime(800))
    rerender(<BatBurst onDone={() => onDone()} />)
    act(() => void vi.advanceTimersByTime(400))

    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('emits from the named edge and fans away from it', () => {
    render(<BatBurst from="left" />)

    const origin = screen.getByTestId('bat-burst')
    expect(origin.dataset.from).toBe('left')
    // Every bat travels away from the container, never back across it.
    for (const bat of origin.querySelectorAll('img')) {
      expect(parseFloat((bat as HTMLElement).style.getPropertyValue('--dx'))).toBeLessThanOrEqual(0)
    }
  })

  it('renders nothing for a reader who asked for reduced motion, and still reports done', () => {
    setReducedMotion(true)
    const onDone = vi.fn()
    render(<BatBurst onDone={onDone} />)

    expect(screen.queryByTestId('bat-burst')).toBeNull()
    act(() => void vi.advanceTimersByTime(10))
    expect(onDone).toHaveBeenCalledTimes(1)
  })
})
