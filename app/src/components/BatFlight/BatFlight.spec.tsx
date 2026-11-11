import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'

// lottie-web drives a real rAF loop over a canvas and throws in jsdom; every other spec that reaches a
// Lottie stubs it the same way.
vi.mock('lottie-react', () => ({ default: () => <span data-testid="lottie" /> }))

import { BatFlight } from './BatFlight'

/** Drives the scheduling timer past its longest possible delay. */
async function waitForTakeoff() {
  await act(async () => {
    vi.advanceTimersByTime(20_000)
  })
}

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
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('BatFlight', () => {
  it('shows nothing until a round is actually due, so an idle page paints no bat', () => {
    render(<BatFlight />)

    expect(screen.queryByTestId('bat-flight')).toBeNull()
  })

  it('sends a PAIR across once the delay elapses, one heading each way', async () => {
    render(<BatFlight />)
    await waitForTakeoff()

    const facings = [...screen.getByTestId('bat-flight').children].map(
      flight => (flight.firstElementChild as HTMLElement).dataset.facing
    )
    expect(facings).toHaveLength(2)
    expect([...facings].sort()).toEqual(['left', 'right'])
  })

  it('keeps the round alive until the LAST of the pair has crossed', async () => {
    render(<BatFlight />)
    await waitForTakeoff()

    await act(async () => {
      screen.getByTestId('bat-flight').children[0].dispatchEvent(new Event('animationend', { bubbles: true }))
    })
    // One down, one still flying: unmounting the layer here would take the other off screen with it.
    expect(screen.getByTestId('bat-flight').children).toHaveLength(1)

    await act(async () => {
      screen.getByTestId('bat-flight').children[0].dispatchEvent(new Event('animationend', { bubbles: true }))
    })
    expect(screen.queryByTestId('bat-flight')).toBeNull()
  })

  it('ignores an animationend bubbling up from the bob, which would cut a crossing short', async () => {
    render(<BatFlight />)
    await waitForTakeoff()

    const bob = screen.getByTestId('bat-flight').children[0].firstElementChild!
    await act(async () => {
      bob.dispatchEvent(new Event('animationend', { bubbles: true }))
    })

    expect(screen.getByTestId('bat-flight').children).toHaveLength(2)
  })

  it('enters from a side rather than from the top, on every heading it picks', async () => {
    // The vertical component of the path is what decides this, and it is bounded so a bat never drops in
    // from above: over many rounds the horizontal reach must always dominate.
    render(<BatFlight />)
    await waitForTakeoff()

    // Both are `calc(<n>vmax + <n>vmin)`; the vmax term is the one along the heading.
    const vmax = (value: string) => Math.abs(Number(/(-?[\d.]+)vmax/.exec(value)?.[1]))

    for (const flight of screen.getByTestId('bat-flight').children) {
      const style = (flight as HTMLElement).style
      const reach = vmax(style.getPropertyValue('--x1'))
      const climb = vmax(style.getPropertyValue('--y1'))
      expect(reach).toBeGreaterThan(0)
      expect(reach).toBeGreaterThan(climb * 3)
    }
  })

  it('never takes off for a reader who asked for reduced motion', async () => {
    setReducedMotion(true)
    render(<BatFlight />)
    await waitForTakeoff()

    expect(screen.queryByTestId('bat-flight')).toBeNull()
  })

  it('schedules nothing while the tab is in the background', async () => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    render(<BatFlight />)
    await waitForTakeoff()

    expect(screen.queryByTestId('bat-flight')).toBeNull()
  })
})
