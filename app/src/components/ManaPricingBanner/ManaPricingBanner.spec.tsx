import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { ManaPricingBanner } from './ManaPricingBanner'

function renderBanner(count: number, onDismiss?: () => void) {
  return render(
    <MemoryRouter>
      <ManaPricingBanner count={count} onDismiss={onDismiss} />
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

  /**
   * The MANA mark belongs to the WORD, not to the banner.
   *
   * Asserted by POSITION rather than by presence, because presence is the easy half: an icon dropped at the
   * start of the strip would satisfy a `getByRole('img')` while saying nothing about the currency. What
   * matters is that text precedes it and MANA follows it — the property that has to survive translation,
   * where the word moves to the end of the sentence.
   */
  it('should put the mana mark against the word mana, inside the sentence', () => {
    renderBanner(1)

    const banner = screen.getByTestId('mana-pricing-banner')
    const mark = banner.querySelector('img')
    expect(mark).not.toBeNull()

    const sentence = mark!.parentElement as HTMLElement
    // Everything after the mark, with the non-breaking space normalised.
    let after = ''
    for (let node = mark!.nextSibling; node; node = node.nextSibling) after += node.textContent ?? ''
    expect(after.replace(/\u00a0/g, ' ').trimStart()).toMatch(/^MANA/)

    // And it is not the first thing in the sentence — the count and "still using" come before it.
    expect(sentence.textContent?.indexOf('MANA')).toBeGreaterThan(0)
  })

  it('should link to the migration tool', () => {
    renderBanner(3)

    const cta = screen.getByTestId('mana-pricing-banner-cta')
    expect(cta.getAttribute('href')).toBe('/import')
    expect(cta).toHaveTextContent(/update prices/i)
  })
})

describe('when the caller offers a way to dismiss the banner', () => {
  it('should not show a close button unless dismissing is possible', () => {
    renderBanner(1)

    expect(screen.queryByTestId('mana-pricing-banner-dismiss')).toBeNull()
  })

  it('should hand the dismissal back to the caller rather than hiding itself', async () => {
    const onDismiss = vi.fn()
    renderBanner(1, onDismiss)

    await userEvent.click(screen.getByTestId('mana-pricing-banner-dismiss'))

    expect(onDismiss).toHaveBeenCalledTimes(1)
    // Still rendered: whether the strip goes away is the page's call, and it is deliberately not stored.
    expect(screen.getByTestId('mana-pricing-banner')).toBeInTheDocument()
  })
})
