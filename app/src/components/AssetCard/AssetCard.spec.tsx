import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import { AssetCard } from './AssetCard'
import { useCart } from '~/store/cart'
import { useFavorites } from '~/store/favorites'
import type { CatalogItem } from '~/lib/api'

// A minimal catalog item — creator '' so the card skips CreatorBadge (which would fetch a profile).
function makeItem(overrides: Partial<CatalogItem> = {}): CatalogItem {
  return {
    id: 't1',
    name: 'Dragon Hat',
    creator: '',
    contractAddress: '0xc',
    itemId: '1',
    category: 'wearable',
    rarity: 'rare',
    network: 'MATIC',
    chainId: 80002,
    thumbnail: '',
    priceCredits: 7,
    gender: null,
    isSmart: false,
    ...overrides
  }
}

function renderCard(item: CatalogItem) {
  return render(
    <MemoryRouter>
      <AssetCard item={item} />
    </MemoryRouter>
  )
}

beforeEach(() => {
  // Stores persist to localStorage between tests; reset so cart/fav state doesn't leak.
  useCart.setState({ items: [] })
  useFavorites.setState({ items: {} })
})

describe('AssetCard flash-sale treatment', () => {
  it('renders the SALE -X% badge, struck-through compare-at, and a countdown when on sale', () => {
    const { container } = renderCard(
      makeItem({ priceCredits: 7, compareAtCredits: 10, saleEndsAt: Date.now() + 2 * 86400_000 })
    )
    // 10 → 7 is a 30% cut.
    expect(screen.getByText(/SALE\s*-30%/)).toBeTruthy()
    const was = container.querySelector('[data-testid="card-price-was"]')
    expect(was?.textContent).toContain('10')
    const now = container.querySelector('[data-testid="card-price-now"]')
    expect(now?.textContent).toContain('7')
    // A live window renders a ticking countdown pill.
    expect(container.querySelector('[data-testid="card-countdown"]')).toBeTruthy()
  })

  it('shows no sale treatment for a regular listing', () => {
    const { container } = renderCard(makeItem({ priceCredits: 7 }))
    expect(screen.queryByText(/SALE/)).toBeNull()
    expect(container.querySelector('[data-testid="card-price-was"]')).toBeNull()
    expect(container.querySelector('[data-testid="card-sale-badge"]')).toBeNull()
  })

  it('ignores a compare-at that does not beat the price (no phantom discount)', () => {
    const { container } = renderCard(makeItem({ priceCredits: 10, compareAtCredits: 10 }))
    expect(container.querySelector('[data-testid="card-sale-badge"]')).toBeNull()
    expect(container.querySelector('[data-testid="card-price-was"]')).toBeNull()
  })
})

// Probe component mounted at the detail route so a test can read the router state the card handed over.
function LocationProbe() {
  const loc = useLocation()
  return <pre data-testid="loc-state">{JSON.stringify(loc.state)}</pre>
}

describe('AssetCard market (legacy) mode', () => {
  it('shows the "≈" live-rate price + a Buy now button, with the Market price tag in the chips row (not the price row)', () => {
    const { container } = render(
      <MemoryRouter>
        <AssetCard item={makeItem()} mode="market" marketPriceCredits={123} onBuyNow={() => {}} />
      </MemoryRouter>
    )
    // Fluctuating price: leading "≈" + the converted credit value, on a single line.
    const price = container.querySelector('[data-testid="card-price-market"]')
    expect(price?.textContent).toContain('≈')
    expect(price?.textContent).toContain('123')
    // The Market price tag moved OUT of the price row (which is what cramped the button) and INTO the
    // chips row.
    expect(price?.querySelector('[data-testid="chip-market"]')).toBeNull()
    expect(container.querySelector('[data-testid="chip-market"]')?.textContent).toMatch(/market price/i)
    // The action is Buy now (not Add to cart), same card element/metrics as a native card.
    expect(container.querySelector('[data-testid="card-cart"]')?.textContent).toMatch(/buy now/i)
  })

  it('disables Buy now when the live rate is unavailable (null price)', () => {
    const { container } = render(
      <MemoryRouter>
        <AssetCard item={makeItem()} mode="market" marketPriceCredits={null} onBuyNow={() => {}} />
      </MemoryRouter>
    )
    expect((container.querySelector('[data-testid="card-cart"]') as HTMLButtonElement).disabled).toBe(true)
    expect(container.querySelector('[data-testid="card-price-market"]')?.textContent).toContain('—')
  })

  it('opens the detail page in market mode when the card body is clicked, passing { item, market, marketPriceCredits } state', () => {
    const item = makeItem({ contractAddress: '0xc', itemId: '1' })
    const { container } = render(
      <MemoryRouter initialEntries={['/assets']}>
        <Routes>
          <Route
            path="/assets"
            element={<AssetCard item={item} mode="market" marketPriceCredits={123} onBuyNow={() => {}} />}
          />
          <Route path="/item/:contractAddress/:seg" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    )
    const link = container.querySelector('[data-testid="card-link"]') as HTMLAnchorElement
    expect(link).toBeTruthy()
    expect(link.getAttribute('href')).toBe('/item/0xc/1')

    fireEvent.click(link)

    // Navigated to the detail route, with EXACTLY the state shape the PDP's market mode reads.
    const state = JSON.parse(screen.getByTestId('loc-state').textContent || '{}')
    expect(state.market).toBe(true)
    expect(state.marketPriceCredits).toBe(123)
    expect(state.item?.id).toBe(item.id)
  })
})
