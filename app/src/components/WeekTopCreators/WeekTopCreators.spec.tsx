import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { CreatorRank } from '~/lib/rankings'

// The table's two data sources are mocked at the lib boundary so the tests drive the row data and the
// artwork independently — including the case where the artwork is missing for a creator, which is a
// real production outcome (one bounded request cannot always reach every ranked creator).
const { fetchTopCreators, fetchCreatorCollectionThumbnails, useProfile } = vi.hoisted(() => ({
  fetchTopCreators: vi.fn(),
  fetchCreatorCollectionThumbnails: vi.fn(),
  useProfile: vi.fn()
}))
vi.mock('~/lib/rankings', () => ({ fetchTopCreators }))
vi.mock('~/lib/collections', () => ({ fetchCreatorCollectionThumbnails }))
vi.mock('~/hooks/useProfile', () => ({ useProfile }))

import { WeekTopCreators } from './WeekTopCreators'

const SOUL = '0x6d873a14a470dd969d7c76a2e088169ab2a1d7ae'
const FURY = '0xa23aa5fce659a828ab52d62a708e29e3347b9eb7'
const NAMES: Record<string, string> = { [SOUL]: 'Soul Magic', [FURY]: 'Elemental Fury' }

function makeCreator(id: string, overrides: Partial<CreatorRank> = {}): CreatorRank {
  return { id, sales: 12, earned: '1000000000000000000', collections: 5, uniqueCollectors: 3, ...overrides }
}

function renderTable(basename?: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      {/* A memory router only resolves a basename when the current entry is inside it. */}
      <MemoryRouter basename={basename} initialEntries={[basename ?? '/']}>
        <WeekTopCreators />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  useProfile.mockReset().mockImplementation((address?: string) => ({ data: { name: NAMES[address ?? ''] } }))
  fetchTopCreators.mockReset().mockResolvedValue([makeCreator(SOUL), makeCreator(FURY, { collections: 2 })])
  fetchCreatorCollectionThumbnails.mockReset().mockResolvedValue({
    [SOUL]: ['https://example.com/a.png', 'https://example.com/b.png', 'https://example.com/c.png']
  })
})

describe('WeekTopCreators rows', () => {
  it('links each row to the creator storefront with the bare ?collections flag', async () => {
    renderTable()
    const link = await screen.findByRole('link', { name: 'View collections by Soul Magic' })
    // Bare flag, not ?collections=true and not ?tab=collections — Creator.tsx reads searchParams.has.
    expect(link).toHaveAttribute('href', `/assets/creator/${SOUL}?collections`)
  })

  it('carries the environment base path through the row link', async () => {
    renderTable('/shop')
    const link = await screen.findByRole('link', { name: 'View collections by Soul Magic' })
    expect(link).toHaveAttribute('href', `/shop/assets/creator/${SOUL}?collections`)
  })

  it('names every row link after its own creator', async () => {
    renderTable()
    await screen.findByRole('link', { name: 'View collections by Soul Magic' })
    const names = screen.getAllByRole('link').map(l => l.getAttribute('aria-label'))
    expect(names).toEqual(['View collections by Soul Magic', 'View collections by Elemental Fury'])
  })

  it('exposes one link per row, so the hover CTA adds no second tab stop to the same URL', async () => {
    renderTable()
    await screen.findByRole('link', { name: 'View collections by Soul Magic' })
    // Two creators → two links. The "View collections" pill is a label on the row link, not a control,
    // and the creator badge is inert markup (no linkToProfile) for the same reason.
    expect(screen.getAllByRole('link')).toHaveLength(2)
    expect(screen.queryByRole('button')).toBeNull()
  })
})

describe('WeekTopCreators collection artwork', () => {
  it('renders the thumbnails the data layer returns, with a +N chip for the collections it has none for', async () => {
    const { container } = renderTable()
    // The artwork lands in a second query, so wait for the overflow chip it produces: 5 collections
    // with artwork for 3 of them → "+2".
    await screen.findByText('+2')
    const soulRow = container.querySelectorAll('tbody tr')[0] as HTMLElement
    expect(soulRow.querySelectorAll('img')).toHaveLength(3)
    expect(within(soulRow).getByText('+2')).toBeTruthy()
  })

  it('falls back to the plain collection count when a creator has no artwork', async () => {
    const { container } = renderTable()
    // Wait for the artwork to have landed for the OTHER creator, so this asserts an absence rather
    // than a not-yet-arrived response.
    await screen.findByText('+2')
    const furyRow = container.querySelectorAll('tbody tr')[1] as HTMLElement
    expect(furyRow.querySelectorAll('img')).toHaveLength(0)
    // The count, not "+2" — nothing was shown for it to be more than.
    expect(within(furyRow).queryByText('+2')).toBeNull()
    expect(within(furyRow).getAllByText('2').length).toBeGreaterThan(0)
  })

  it('asks for artwork once for the whole table, bounded, rather than once per row', async () => {
    renderTable()
    await screen.findByRole('link', { name: 'View collections by Soul Magic' })
    expect(fetchCreatorCollectionThumbnails).toHaveBeenCalledTimes(1)
    expect(fetchCreatorCollectionThumbnails).toHaveBeenCalledWith(
      [SOUL, FURY],
      expect.objectContaining({ perCreator: 3, first: 40 })
    )
  })
})
