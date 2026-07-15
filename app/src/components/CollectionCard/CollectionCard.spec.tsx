import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CollectionCard } from './CollectionCard'
import type { CollectionMeta } from '~/lib/collections'

// Passing `cover` + `itemCount` makes the card fully controlled: the items query stays disabled, so
// it never hits the network. useQuery still needs a client in context (even disabled), so wrap it.
// creator '' skips CreatorBadge's profile fetch.
function renderCard(overrides: Partial<CollectionMeta & { cover: string; itemCount: number }> = {}) {
  const { cover, itemCount, ...meta } = {
    contractAddress: '0xabc',
    name: 'Soul Magic',
    creator: '',
    cover: 'https://example.com/cover.png',
    itemCount: 250,
    ...overrides,
  }
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <CollectionCard collection={meta} cover={cover} itemCount={itemCount} />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('CollectionCard', () => {
  it('renders the collection name, item count and a view-collection action', () => {
    renderCard()
    expect(screen.getByText('Soul Magic')).toBeTruthy()
    expect(screen.getByText('250 Items')).toBeTruthy()
    expect(screen.getByText('View collection')).toBeTruthy()
  })

  it('pluralizes a single item', () => {
    renderCard({ itemCount: 1 })
    expect(screen.getByText('1 Item')).toBeTruthy()
  })

  it('renders the supplied cover image', () => {
    const { container } = renderCard({ cover: 'https://example.com/hero.png' })
    const img = container.querySelector('.coll-card__img')
    expect((img as HTMLImageElement | null)?.src).toBe('https://example.com/hero.png')
  })
})
