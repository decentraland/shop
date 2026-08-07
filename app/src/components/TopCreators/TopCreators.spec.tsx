import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ProfileAvatar } from '~/lib/profile'

// Mocked at the two network boundaries only — the ranking and the profile batch. The selection between
// them is the real `lib/topCreators`, so these tests see the row a production response would produce.
const { fetchShopTopCreators, fetchProfiles } = vi.hoisted(() => ({
  fetchShopTopCreators: vi.fn(),
  fetchProfiles: vi.fn()
}))
vi.mock('~/lib/rankings', () => ({ fetchShopTopCreators }))
vi.mock('~/lib/profile', () => ({ fetchProfiles }))

import { TopCreators } from './TopCreators'

const SOUL = '0x6d873a14a470dd969d7c76a2e088169ab2a1d7ae'
const FURY = '0xa23aa5fce659a828ab52d62a708e29e3347b9eb7'

function claimed(name: string): ProfileAvatar {
  return { name, hasClaimedName: true, ethAddress: '0x0' }
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
  fetchShopTopCreators.mockReset().mockResolvedValue([
    { id: SOUL, sales: 62 },
    { id: FURY, sales: 1 }
  ])
  fetchProfiles.mockReset().mockResolvedValue(
    new Map([
      [SOUL, claimed('Soul Magic')],
      [FURY, claimed('Elemental Fury')]
    ])
  )
})

describe('TopCreators cards', () => {
  // Eight, not four: the row is a two-page carousel on desktop. The candidate pool is deliberately much
  // larger — unclaimed names and duplicates are dropped after ranking, so asking for eight would leave
  // the row short.
  it('should ask for a window of recent sales and far more candidates than it shows', async () => {
    renderSection()
    await screen.findByRole('link', { name: 'View creations by Soul Magic' })

    expect(fetchShopTopCreators).toHaveBeenCalledWith(30, 30)
    expect(screen.getAllByTestId('top-creator-card')).toHaveLength(2)
  })

  // Eight is also what the row promises while it loads: a skeleton count that does not match the real one
  // makes the section resize the moment the ranking lands.
  it('should hold eight card slots while loading, with no controls over them yet', () => {
    fetchShopTopCreators.mockReturnValue(new Promise(() => {}))
    renderSection()

    expect(screen.getAllByTestId('top-creator-skeleton')).toHaveLength(8)
    expect(screen.queryByTestId('top-creators-dots')).toBeNull()
  })

  it('should look up every candidate profile in one request', async () => {
    renderSection()
    await screen.findByRole('link', { name: 'View creations by Soul Magic' })

    expect(fetchProfiles).toHaveBeenCalledTimes(1)
    expect(fetchProfiles).toHaveBeenCalledWith([SOUL, FURY])
  })

  // What the card is FOR: the number that put the creator on the row. It used to print their published
  // collection and item totals, which say how big a back catalogue is, not that anyone is buying from it.
  it('should say how much the creator recently sold, per card', async () => {
    renderSection()

    expect(await screen.findByText('62 sales in the last 30 days')).toBeTruthy()
    expect(screen.getByText('1 sale in the last 30 days')).toBeTruthy()
  })

  it('should link each card to the creator storefront listings, with no collections flag', async () => {
    renderSection()
    const link = await screen.findByRole('link', { name: 'View creations by Soul Magic' })

    expect(link).toHaveAttribute('href', `/items/creator/${SOUL}`)
  })

  it('should carry the environment base path through the card link', async () => {
    renderSection('/shop')
    const link = await screen.findByRole('link', { name: 'View creations by Soul Magic' })

    expect(link).toHaveAttribute('href', `/shop/items/creator/${SOUL}`)
  })

  it('should expose one link per card, so the hover CTA adds no second tab stop to the same URL', async () => {
    renderSection()
    await screen.findByRole('link', { name: 'View creations by Soul Magic' })

    expect(screen.getAllByRole('link')).toHaveLength(2)
  })

  /**
   * The filter is the point of asking for thirty candidates. It runs BEFORE anything renders — the
   * alternative, a row that paints and then drops a card, is worse than a slower row.
   */
  it('should never show a creator without a claimed name', async () => {
    fetchProfiles.mockResolvedValue(
      new Map([
        [SOUL, { name: 'test', hasClaimedName: false }],
        [FURY, claimed('Elemental Fury')]
      ])
    )
    renderSection()

    await screen.findByRole('link', { name: 'View creations by Elemental Fury' })
    expect(screen.getAllByTestId('top-creator-card')).toHaveLength(1)
    expect(screen.queryByText(/^test/)).toBeNull()
  })
})

describe('TopCreators empty and error states', () => {
  it('should render nothing when the ranking comes back empty', async () => {
    fetchShopTopCreators.mockResolvedValue([])
    const { container } = renderSection()

    await vi.waitFor(() => expect(container.querySelector('[data-testid="top-creators"]')).toBeNull())
  })

  it('should render nothing when the ranking fails', async () => {
    fetchShopTopCreators.mockRejectedValue(new Error('boom'))
    const { container } = renderSection()

    await vi.waitFor(() => expect(container.querySelector('[data-testid="top-creators"]')).toBeNull())
  })

  // Every candidate failing the name filter leaves an empty row, not a section with a heading over
  // nothing.
  it('should render nothing when no candidate is presentable', async () => {
    fetchProfiles.mockResolvedValue(new Map())
    const { container } = renderSection()

    await vi.waitFor(() => expect(container.querySelector('[data-testid="top-creators"]')).toBeNull())
  })

  it('should render nothing when the profile lookup fails', async () => {
    fetchProfiles.mockRejectedValue(new Error('boom'))
    const { container } = renderSection()

    await vi.waitFor(() => expect(container.querySelector('[data-testid="top-creators"]')).toBeNull())
  })
})
