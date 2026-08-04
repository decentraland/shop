import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { CreatorRank } from '~/lib/rankings'

// The card's three sources are mocked at their own boundary so the tests drive the ranking, the
// profile and the store blurb independently — a creator with no store entity is a real production
// outcome (most creators never write one), and the card has to keep its two lines anyway.
const { fetchTopCreators, fetchCreatorItems, useProfile, useStore } = vi.hoisted(() => ({
  fetchTopCreators: vi.fn(),
  fetchCreatorItems: vi.fn(),
  useProfile: vi.fn(),
  useStore: vi.fn()
}))
vi.mock('~/lib/rankings', () => ({ fetchTopCreators }))
vi.mock('~/lib/collections', () => ({ fetchCreatorItems }))
vi.mock('~/hooks/useProfile', () => ({ useProfile }))
vi.mock('~/hooks/useStore', () => ({ useStore }))

import { TopCreators } from './TopCreators'

const SOUL = '0x6d873a14a470dd969d7c76a2e088169ab2a1d7ae'
const FURY = '0xa23aa5fce659a828ab52d62a708e29e3347b9eb7'
const NAMES: Record<string, string> = { [SOUL]: 'Soul Magic', [FURY]: 'Elemental Fury' }
const BLURBS: Record<string, string> = { [SOUL]: 'Cyberpunk wearables | 3D Artist' }

function makeCreator(id: string, overrides: Partial<CreatorRank> = {}): CreatorRank {
  return { id, sales: 12, earned: '1000000000000000000', collections: 5, uniqueCollectors: 3, ...overrides }
}

function renderSection(basename?: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      {/* A memory router only resolves a basename when the current entry is inside it. */}
      <MemoryRouter basename={basename} initialEntries={[basename ?? '/']}>
        <TopCreators />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  useProfile.mockReset().mockImplementation((address?: string) => ({ data: { name: NAMES[address ?? ''] } }))
  useStore.mockReset().mockImplementation((address?: string) => ({
    data: { cover: '', coverHash: '', description: BLURBS[address ?? ''] ?? '', links: {} }
  }))
  fetchCreatorItems.mockReset().mockResolvedValue({ items: [], total: 1 })
  fetchTopCreators.mockReset().mockResolvedValue([makeCreator(SOUL), makeCreator(FURY, { collections: 1 })])
})

describe('TopCreators cards', () => {
  it('ranks by sales — the "most active" creators of the week — and asks for no more than four', async () => {
    renderSection()
    await screen.findByRole('link', { name: 'View creations by Soul Magic' })
    expect(fetchTopCreators).toHaveBeenCalledWith('week', 4, 'most_sales')
  })

  it('links each card to the creator storefront listings, with no collections flag', async () => {
    renderSection()
    const link = await screen.findByRole('link', { name: 'View creations by Soul Magic' })
    expect(link).toHaveAttribute('href', `/items/creator/${SOUL}`)
  })

  it('carries the environment base path through the card link', async () => {
    renderSection('/shop')
    const link = await screen.findByRole('link', { name: 'View creations by Soul Magic' })
    expect(link).toHaveAttribute('href', `/shop/items/creator/${SOUL}`)
  })

  it('exposes one link per card, so the hover CTA adds no second tab stop to the same URL', async () => {
    renderSection()
    await screen.findByRole('link', { name: 'View creations by Soul Magic' })
    expect(screen.getAllByRole('link')).toHaveLength(2)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('shows the store blurb when the creator wrote one', async () => {
    renderSection()
    expect(await screen.findByText('Cyberpunk wearables | 3D Artist')).toBeTruthy()
  })

  it('falls back to the collection and item counts when the creator has no store blurb', async () => {
    renderSection()
    // Singular on both counts — the fallback pluralizes rather than reading "1 collections".
    expect(await screen.findByText('1 collection | 1 item')).toBeTruthy()
    // Only for the creator who needs it, and bounded to a single row: the count comes off the page total.
    expect(fetchCreatorItems).toHaveBeenCalledTimes(1)
    expect(fetchCreatorItems).toHaveBeenCalledWith(FURY, { first: 1 })
  })

  it('leaves the blurb empty rather than guessing when the item count is unavailable', async () => {
    fetchCreatorItems.mockRejectedValue(new Error('boom'))
    renderSection()
    const card = await screen.findByRole('link', { name: 'View creations by Elemental Fury' })
    await vi.waitFor(() => expect(fetchCreatorItems).toHaveBeenCalled())
    expect(card.textContent).not.toContain('collection')
  })
})

describe('TopCreators empty and error states', () => {
  it('renders nothing when the ranking comes back empty', async () => {
    fetchTopCreators.mockResolvedValue([])
    const { container } = renderSection()
    await vi.waitFor(() => expect(container.querySelector('[data-testid="top-creators"]')).toBeNull())
  })

  it('renders nothing when the ranking fails', async () => {
    fetchTopCreators.mockRejectedValue(new Error('boom'))
    const { container } = renderSection()
    await vi.waitFor(() => expect(container.querySelector('[data-testid="top-creators"]')).toBeNull())
  })
})
