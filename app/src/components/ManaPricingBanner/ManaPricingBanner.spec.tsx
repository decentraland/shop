import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ManaPricingBanner } from './ManaPricingBanner'

function renderBanner(count: number) {
  return render(
    <MemoryRouter>
      <ManaPricingBanner count={count} />
    </MemoryRouter>
  )
}

describe('when the seller has classic listings left to move', () => {
  it('should name the count in the singular for one listing', () => {
    renderBanner(1)

    expect(screen.getByTestId('mana-pricing-banner')).toHaveTextContent(
      '1 item is still using MANA pricing. Switch to Credits to keep your prices stable.'
    )
  })

  it('should name the count in the plural for several listings', () => {
    renderBanner(7)

    expect(screen.getByTestId('mana-pricing-banner')).toHaveTextContent('7 items are still using MANA pricing.')
  })

  it('should link to the migration tool', () => {
    renderBanner(3)

    const cta = screen.getByTestId('mana-pricing-banner-cta')
    expect(cta.getAttribute('href')).toBe('/import')
    expect(cta).toHaveTextContent(/update prices/i)
  })
})
