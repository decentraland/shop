import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { ReactElement } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AssetCard } from './AssetCard'
import { useCart } from '~/store/cart'
import { useFavorites } from '~/store/favorites'
import { useWallet } from '~/store/wallet'
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

describe('AssetCard author row', () => {
  it('does NOT render a creator/author row, even when the item has a creator', () => {
    // The shop cards intentionally omit the "By {author}" line + avatar (owner request).
    const { container } = renderCard(makeItem({ creator: '0x' + 'ab'.repeat(20) }))
    expect(container.querySelector('[data-testid="creator"]')).toBeNull()
    expect(container.querySelector('.card__creator')).toBeNull()
    expect(screen.queryByText(/^By\b/i)).toBeNull()
  })
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

describe('AssetCard own-item MANAGE CTA', () => {
  const ME = '0x' + '11'.repeat(20)

  // creator === you means the card renders CreatorBadge (which reads a profile via react-query), so
  // these renders need a QueryClientProvider (the profile fetch is fire-and-forget / disabled here).
  function renderWithQuery(ui: ReactElement) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
  }

  afterEach(() => {
    // The wallet store is real (not mocked) — clear the session so it doesn't leak into other suites.
    useWallet.setState({ session: null })
  })

  it('labels the action MANAGE (not "your item") for your own primary item and enables it', () => {
    useWallet.setState({ session: { address: ME } as never })
    // A primary item you created (creator === you, no tokenId) → isOwnListing is true.
    const { container } = renderWithQuery(
      <MemoryRouter>
        <AssetCard item={makeItem({ creator: ME })} />
      </MemoryRouter>
    )
    const cart = container.querySelector('[data-testid="card-cart"]') as HTMLButtonElement
    expect(cart.textContent).toMatch(/manage/i)
    expect(cart.textContent).not.toMatch(/your item/i)
    // MANAGE is actionable (unlike the old disabled "your item").
    expect(cart.disabled).toBe(false)
  })

  it('navigates to the item detail page (management view) when MANAGE is clicked, without adding to cart', () => {
    useWallet.setState({ session: { address: ME } as never })
    const item = makeItem({ creator: ME, contractAddress: '0xc', itemId: '1' })
    const { container } = renderWithQuery(
      <MemoryRouter initialEntries={['/assets']}>
        <Routes>
          <Route path="/assets" element={<AssetCard item={item} />} />
          <Route path="/item/:contractAddress/:seg" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    )
    fireEvent.click(container.querySelector('[data-testid="card-cart"]') as HTMLButtonElement)
    // Landed on the detail route with the item seeded in state (so the management view can render it)…
    const state = JSON.parse(screen.getByTestId('loc-state').textContent || '{}')
    expect(state.item?.id).toBe(item.id)
    // …and it never added your own item to the cart.
    expect(useCart.getState().items).toHaveLength(0)
  })
})

describe('AssetCard view-only mode', () => {
  function renderView(item: CatalogItem) {
    return render(
      <MemoryRouter>
        <AssetCard item={item} mode="view" />
      </MemoryRouter>
    )
  }

  it('shows a NOT FOR SALE tag + VIEW button and no add-to-cart when the item is not for sale', () => {
    const { container } = renderView(makeItem({ priceCredits: 0 }))
    expect(container.querySelector('[data-testid="card-nfs"]')?.textContent).toMatch(/not for sale/i)
    expect(container.querySelector('[data-testid="card-view"]')?.textContent).toMatch(/view/i)
    // View-only cards never render a trade action.
    expect(container.querySelector('[data-testid="card-cart"]')).toBeNull()
    expect(container.querySelector('[data-testid="card-add-round"]')).toBeNull()
  })

  it('shows the credit price (not the tag) + VIEW button for a for-sale catalog item', () => {
    const { container } = renderView(makeItem({ priceCredits: 42 }))
    expect(container.querySelector('[data-testid="card-nfs"]')).toBeNull()
    expect(container.querySelector('[data-testid="card-view"]')).toBeTruthy()
    expect(container.querySelector('.card__price')?.textContent).toContain('42')
    expect(container.querySelector('[data-testid="card-cart"]')).toBeNull()
  })

  it('navigates to the item detail via the whole-card link, seeding the item in router state', () => {
    const item = makeItem({ priceCredits: 0, contractAddress: '0xc', itemId: '1' })
    const { container } = render(
      <MemoryRouter initialEntries={['/assets']}>
        <Routes>
          <Route path="/assets" element={<AssetCard item={item} mode="view" />} />
          <Route path="/item/:contractAddress/:seg" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    )
    const link = container.querySelector('[data-testid="card-link"]') as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe('/item/0xc/1')
    fireEvent.click(link)
    const state = JSON.parse(screen.getByTestId('loc-state').textContent || '{}')
    expect(state.item?.id).toBe(item.id)
    expect(state.market).toBeUndefined()
  })
})

describe('AssetCard manage-link mode (owned My Assets card)', () => {
  it('navigates to the item detail (management view) when MANAGE is clicked on an owned wearable/emote', () => {
    // A held token carries a tokenId — the MANAGE cta opens /item/:contract/:tokenId with the item seeded.
    const item = makeItem({ contractAddress: '0xc', tokenId: '9', itemId: null })
    const { container } = render(
      <MemoryRouter initialEntries={['/my-assets']}>
        <Routes>
          <Route path="/my-assets" element={<AssetCard item={item} mode="manage-link" />} />
          <Route path="/item/:contractAddress/:seg" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    )
    const manage = container.querySelector('[data-testid="card-manage"]') as HTMLButtonElement
    expect(manage.textContent).toMatch(/manage/i)
    fireEvent.click(manage)
    const state = JSON.parse(screen.getByTestId('loc-state').textContent || '{}')
    expect(state.item?.id).toBe(item.id)
  })

  it('renders an external Builder link (new tab) as the MANAGE cta for an owned NAME', () => {
    const item = makeItem({ category: 'ens', name: 'CoolName', contractAddress: '0xreg', tokenId: '5' })
    const { container } = render(
      <MemoryRouter>
        <AssetCard
          item={item}
          mode="manage-link"
          manageHref="https://decentraland.zone/builder/names/CoolName"
        />
      </MemoryRouter>
    )
    const manage = container.querySelector('[data-testid="card-manage"]') as HTMLAnchorElement
    expect(manage.tagName).toBe('A')
    expect(manage.getAttribute('href')).toBe('https://decentraland.zone/builder/names/CoolName')
    expect(manage.getAttribute('target')).toBe('_blank')
    expect(manage.getAttribute('rel')).toContain('noopener')
    // The whole card is an external link to the same Builder page (keyboard-reachable + tappable on
    // mobile, where the MANAGE pill is hidden) — a NAME has no in-app detail page.
    const link = container.querySelector('[data-testid="card-link"]') as HTMLAnchorElement
    expect(link.tagName).toBe('A')
    expect(link.getAttribute('href')).toBe('https://decentraland.zone/builder/names/CoolName')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toContain('noopener')
    // A NAME can't be favourited in the shop.
    expect(container.querySelector('[data-testid="card-fav"]')).toBeNull()
  })
})
