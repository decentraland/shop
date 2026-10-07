import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'

// lottie-web drives a real rAF loop over a canvas and throws in jsdom; every spec that reaches a Lottie
// stubs it the same way.
vi.mock('lottie-react', () => ({ default: () => <span data-testid="lottie" /> }))

import { SpiderDrop } from './SpiderDrop'

/** Past the longest first-visit delay. */
async function waitForVisit() {
  await act(async () => {
    vi.advanceTimersByTime(31_000)
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

describe('SpiderDrop', () => {
  it('shows nothing until a visit is due', () => {
    render(<SpiderDrop />)

    expect(screen.queryByTestId('spider-drop')).toBeNull()
  })

  it('drops a spider once the delay elapses', async () => {
    render(<SpiderDrop />)
    await waitForVisit()

    expect(screen.getByTestId('spider-drop')).toBeInTheDocument()
  })

  it('hangs from the sub-nav it measures rather than from a hardcoded offset', async () => {
    // The bar is 66px tall only on wide viewports; below `lg` it wraps onto more rows and grows, and an
    // assumed height left the spider hanging from inside the nav.
    const subnav = document.createElement('div')
    subnav.setAttribute('data-testid', 'subnav')
    vi.spyOn(subnav, 'getBoundingClientRect').mockReturnValue({ bottom: 241 } as DOMRect)
    document.body.appendChild(subnav)

    render(<SpiderDrop />)
    await waitForVisit()

    expect(screen.getByTestId('spider-drop')).toHaveStyle({ top: '241px' })
    subnav.remove()
  })

  it('anchors to its own side, so a right-hand visit cannot hang half off the window', async () => {
    render(<SpiderDrop />)
    await waitForVisit()

    const style = screen.getByTestId('spider-drop').style
    const anchored = style.left !== '' ? 'left' : 'right'
    expect(style.getPropertyValue(anchored)).toMatch(/%$/)
    // Exactly one of them, never both: setting the pair would stretch the box across the viewport.
    expect(style.left !== '' && style.right !== '').toBe(false)
  })

  it('takes itself away once the visit is over, so lottie stops driving frames', async () => {
    render(<SpiderDrop />)
    await waitForVisit()

    await act(async () => {
      vi.advanceTimersByTime(5_300)
    })

    expect(screen.queryByTestId('spider-drop')).toBeNull()
  })

  it('never drops in for a reader who asked for reduced motion', async () => {
    setReducedMotion(true)
    render(<SpiderDrop />)
    await waitForVisit()

    expect(screen.queryByTestId('spider-drop')).toBeNull()
  })

  it('schedules nothing while the tab is in the background', async () => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    render(<SpiderDrop />)
    await waitForVisit()

    expect(screen.queryByTestId('spider-drop')).toBeNull()
  })
})
