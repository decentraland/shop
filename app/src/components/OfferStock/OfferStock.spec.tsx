import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { OfferStock } from './OfferStock'

describe('OfferStock', () => {
  it('shows a large allowance compactly and keeps the exact figure for assistive tech', () => {
    render(<OfferStock claimed={0} total={1_000_000} testId="stock" />)
    expect(screen.getByTestId('stock').textContent).toContain('0 of 1M claimed')
    expect(screen.getByRole('progressbar').getAttribute('aria-label')).toBe('0 of 1,000,000 claimed')
  })

  it('keeps small counts exact', () => {
    render(<OfferStock claimed={37} total={1_500} testId="stock" />)
    expect(screen.getByTestId('stock').textContent).toContain('37 of 1,500 claimed')
  })

  it('falls back to exact figures when both sides would compact to the same label', () => {
    render(<OfferStock claimed={1_000_500} total={1_005_000} testId="stock" />)
    expect(screen.getByTestId('stock').textContent).toContain('1,000,500 of 1,005,000 claimed')
  })
})
