import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
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
    const was = container.querySelector('.card__price-was')
    expect(was?.textContent).toContain('10')
    const now = container.querySelector('.card__price-now')
    expect(now?.textContent).toContain('7')
    // A live window renders a ticking countdown pill.
    expect(container.querySelector('.card__countdown')).toBeTruthy()
  })

  it('shows no sale treatment for a regular listing', () => {
    const { container } = renderCard(makeItem({ priceCredits: 7 }))
    expect(screen.queryByText(/SALE/)).toBeNull()
    expect(container.querySelector('.card__price-was')).toBeNull()
    expect(container.querySelector('.card__sale-badge')).toBeNull()
  })

  it('ignores a compare-at that does not beat the price (no phantom discount)', () => {
    const { container } = renderCard(makeItem({ priceCredits: 10, compareAtCredits: 10 }))
    expect(container.querySelector('.card__sale-badge')).toBeNull()
    expect(container.querySelector('.card__price-was')).toBeNull()
  })
})
