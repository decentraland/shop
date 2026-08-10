import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('~/hooks/useCartAvailability', () => ({ useCartAvailability: () => ({}) }))
vi.mock('~/lib/cart-availability', () => ({ isLineBuyable: () => true }))

const cart = {
  items: [
    {
      id: 'item-1',
      name: 'Cool Hat',
      creator: '0xc',
      image: '',
      priceCredits: 54,
      quantity: 1,
      contractAddress: '0xcontract',
      itemId: '1'
    }
  ],
  open: true,
  justAddedCount: 1,
  setOpen: vi.fn(),
  remove: vi.fn(),
  increment: vi.fn(),
  decrement: vi.fn()
}
vi.mock('~/store/cart', () => ({ useCart: (sel: (s: typeof cart) => unknown) => sel(cart) }))

import { CartPopover } from '~/components/CartPopover'

function renderPopover() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <CartPopover />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

/**
 * The popover opens from adding to the cart — often over a hover — and it is NOT a place to commit
 * someone's money. Its primary button used to carry `startCheckout`, which landed on /cart and started
 * the charge on arrival: a buyer who wanted to look at their basket had already bought it.
 *
 * That was removed once (#300) and a styling PR (#304) overwrote the block and brought it back, with
 * nobody noticing until a screenshot. Hence this file: the guarantee is now a test, not a comment.
 */
describe('the cart popover CTAs', () => {
  it('should send the buyer to the cart without starting a checkout', () => {
    renderPopover()

    const goToCart = screen.getByRole('link', { name: /go to cart/i })
    expect(goToCart).toHaveAttribute('href', '/cart')
    // react-router serialises link state onto the anchor; carrying any is what started the charge.
    expect(goToCart.getAttribute('href')).not.toMatch(/startCheckout/i)
  })

  // Nothing in here may buy. Two links to /cart would be one too many ways to leave, and a button that
  // charges has no business in a panel that appeared on its own.
  it('should offer no way to buy from the popover at all', () => {
    renderPopover()

    expect(screen.queryByRole('link', { name: /^checkout$/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /^checkout$/i })).toBeNull()
  })

  // The dismiss half: a button, because it navigates nowhere.
  it('should close rather than navigate when the buyer keeps shopping', () => {
    renderPopover()

    expect(screen.getByRole('button', { name: /continue shopping/i })).toBeInTheDocument()
  })
})
