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
    { id: SOUL, sales: 62, totalSales: 3514, collections: 30, items: 166 },
    { id: FURY, sales: 1, totalSales: 1, collections: 4, items: 12 }
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

  // What the card says about a creator: what they have published, and what they have sold over ALL time.
  // The 30-day figure decides who is on the row; it is not what the row shows.
  it('should introduce the creator with their catalogue and their lifetime sales', async () => {
    renderSection()
    const card = await screen.findByRole('link', { name: 'View creations by Soul Magic' })

    expect(card.textContent).toContain('30 Collections | 166 Items')
    expect(card.textContent).toContain('Total sales: 3,514')
  })

  // Four digits and up is where an ungrouped run stops being readable, and creator totals reach five.
  it('should group a large total the way the reader locale does', async () => {
    fetchShopTopCreators.mockResolvedValue([{ id: SOUL, sales: 62, totalSales: 12467, collections: 94, items: 372 }])
    renderSection()
    const card = await screen.findByRole('link', { name: 'View creations by Soul Magic' })

    expect(card.textContent).toContain('Total sales: 12,467')
    expect(card.textContent).not.toContain('12467')
  })

  // The window count decides the ORDER. Printing it would say a creator with 3,514 lifetime sales has 62.
  it('should never show the window count the ranking was ordered by', async () => {
    renderSection()
    const card = await screen.findByRole('link', { name: 'View creations by Soul Magic' })

    expect(card.textContent).not.toContain('62')
  })

  /**
   * The shop and the ranking service deploy on their own schedules, so a production shop WILL at some
   * point read rows from a server that does not send these yet. Formatting an absent figure threw inside
   * render, which takes down the whole row — a section of the home page lost to a field that had not
   * shipped.
   */
  describe('when the ranking service has not shipped the card figures yet', () => {
    beforeEach(() => {
      fetchShopTopCreators.mockResolvedValue([{ id: SOUL, sales: 62 }])
    })

    it('should still introduce the creator, minus the figures it was not given', async () => {
      renderSection()
      const card = await screen.findByRole('link', { name: 'View creations by Soul Magic' })

      expect(card.textContent).toContain('Soul Magic')
      expect(card.textContent).toContain('View creations')
      expect(card.textContent).not.toContain('Total sales')
      expect(card.textContent).not.toContain('Collections')
    })
  })

  // Zero is a figure the server SENT, and a creator really can have sold nothing — it must not be mistaken
  // for a field that never arrived.
  it('should say zero when the count is genuinely zero', async () => {
    fetchShopTopCreators.mockResolvedValue([{ id: SOUL, sales: 1, totalSales: 0, collections: 2, items: 12 }])
    renderSection()
    const card = await screen.findByRole('link', { name: 'View creations by Soul Magic' })

    expect(card.textContent).toContain('Total sales: 0')
  })

  /**
   * A month can be won on one lucky item, and the card then undercuts the creator it is introducing.
   * Production had `sebga` third on 33 sales of two items, next to a neighbour showing 45 collections.
   */
  it('should leave out a creator with almost nothing to browse, however well the month went', async () => {
    fetchShopTopCreators.mockResolvedValue([
      { id: SOUL, sales: 99, totalSales: 62, collections: 4, items: 4 },
      { id: FURY, sales: 1, totalSales: 1168, collections: 45, items: 135 }
    ])
    renderSection()

    await screen.findByRole('link', { name: 'View creations by Elemental Fury' })
    expect(screen.getAllByTestId('top-creator-card')).toHaveLength(1)
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
