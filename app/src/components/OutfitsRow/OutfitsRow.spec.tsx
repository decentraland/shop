import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { Outfit } from '~/lib/outfits'

/**
 * "Shop the look" while it loads.
 *
 * The row used to answer `isLoading` with `return null`, so the whole section — heading, rail, dots —
 * appeared only once the outfits landed and dropped everything under it (the creators row and the footer)
 * by a card's height: 472px on a desktop window, 605px at 375px, measured. These specs pin the three
 * answers the row has to keep apart: a section that does not exist (no shop-server, or no showable look),
 * one that exists but has nothing in it YET, and one with looks in it.
 */

const { useOutfits, useOutfitItems, available } = vi.hoisted(() => ({
  useOutfits: vi.fn(),
  useOutfitItems: vi.fn(),
  available: { value: true }
}))
vi.mock('~/hooks/useOutfits', () => ({ useOutfits, useOutfitItems }))
// Only the host check is faked; every other outfit helper the row uses stays real.
vi.mock('~/lib/outfits', async importOriginal => {
  const actual = await importOriginal<typeof import('~/lib/outfits')>()
  return { ...actual, isOutfitsAvailable: () => available.value }
})
// The card has its own behaviour (totals, add-to-cart) and its own coverage; here it is one box on a rail.
vi.mock('~/components/OutfitCard', () => ({
  OutfitCard: ({ outfit }: { outfit: Outfit }) => <div data-testid="outfit-card">{outfit.name}</div>
}))

import { OutfitsRow } from './OutfitsRow'

// The count the row reserves with — one per card the widest tier shows.
const SKELETONS = 6

function look(id: string, name: string): Outfit {
  return {
    id,
    name,
    thumbnailHash: 'hash',
    items: [{ contractAddress: '0xc0', itemId: '0' }],
    bodyShape: 'unisex',
    gradientFrom: '#a855f7',
    gradientTo: '#e0219a',
    authorAddress: '0xcc',
    published: true,
    createdAt: 1,
    updatedAt: 1
  }
}

// A resolution in which the one item every look above is built from is live and priced, so the row's
// "every item still buyable" display filter keeps the looks. `hasPrimaryListing` is not decoration:
// isBuyableFromCreator requires it, so an item without it makes the whole look unshowable and the row
// renders nothing at all.
const resolved = {
  byKey: new Map([['0xc0-0', { id: '0xc0-0', priceCredits: 100, available: 5, hasPrimaryListing: true } as never]]),
  missing: new Set<string>(),
  isLoading: false,
  isError: false,
  retry: vi.fn()
}

function renderRow() {
  return render(
    <MemoryRouter>
      <OutfitsRow />
    </MemoryRouter>
  )
}

beforeEach(() => {
  available.value = true
  useOutfits.mockReset().mockReturnValue({ data: [], isLoading: true })
  useOutfitItems.mockReset().mockReturnValue(resolved)
})

describe('the outfits row while it loads', () => {
  it('renders the section with a placeholder for every look it is about to show', () => {
    renderRow()
    expect(screen.getByTestId('outfits-row')).toBeTruthy()
    expect(screen.getByText('Buy the Look')).toBeTruthy()
    expect(screen.getAllByTestId('skeleton-outfit-card')).toHaveLength(SKELETONS)
  })

  it('reserves the page-indicator strip, whose 24px used to arrive with the looks', () => {
    renderRow()
    expect(screen.getByTestId('rail-dots-reserved')).toBeTruthy()
  })

  it('offers no arrows or dots to page a rail of placeholders', () => {
    renderRow()
    expect(screen.queryByTestId('outfits-row-prev')).toBeNull()
    expect(screen.queryByTestId('outfits-row-next')).toBeNull()
    expect(screen.queryByTestId('outfits-row-dots')).toBeNull()
  })
})

describe('the outfits row once it has answered', () => {
  it('swaps the placeholders for the looks, leaving none behind', () => {
    useOutfits.mockReturnValue({ data: [look('a', 'Galaxy Look'), look('b', 'Cosmic Look')], isLoading: false })
    renderRow()
    expect(screen.getAllByTestId('outfit-card')).toHaveLength(2)
    expect(screen.queryByTestId('skeleton-outfit-card')).toBeNull()
  })

  it('renders nothing at all when no shop-server is configured — there is no section to hold space for', () => {
    available.value = false
    const { container } = renderRow()
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing once it has settled on no showable look', () => {
    useOutfits.mockReturnValue({ data: [], isLoading: false })
    const { container } = renderRow()
    expect(container.firstChild).toBeNull()
  })
})
