import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { HolidayLights } from './HolidayLights'

function setWidth(px: number) {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(px)
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', undefined)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('HolidayLights', () => {
  it('draws nothing until the bar has a width', () => {
    setWidth(0)
    render(<HolidayLights />)
    expect(screen.getByTestId('holiday-lights')).toBeEmptyDOMElement()
  })

  it('hangs three bulbs per span, covering the whole width', () => {
    setWidth(300)
    render(<HolidayLights />)
    // 300px rounds up to three 120px spans, so the string never stops short of the right edge.
    expect(screen.getAllByTestId('holiday-bulb')).toHaveLength(9)
  })

  it('never puts the same colour on two neighbouring bulbs', () => {
    setWidth(480)
    render(<HolidayLights />)
    const colors = screen.getAllByTestId('holiday-bulb').map(b => b.style.getPropertyValue('--bulb'))
    colors.slice(1).forEach((color, i) => expect(color).not.toBe(colors[i]))
  })

  it('is hidden from assistive technology', () => {
    setWidth(240)
    render(<HolidayLights />)
    expect(screen.getByTestId('holiday-lights')).toHaveAttribute('aria-hidden')
  })
})
