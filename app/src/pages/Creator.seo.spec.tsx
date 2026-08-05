import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

/**
 * A CREATOR STOREFRONT'S SHARED CARD.
 *
 * A creator link should arrive with the creator on it. The profile service serves a 256x256 face snapshot,
 * which is exactly the square shape the hook's thumb card is built for — so the card carries that, and
 * falls back to the shop default for an address that has no profile at all.
 *
 * The mock preamble mirrors Creator.spec.tsx: the page pulls the card/cart stack transitively, and that
 * reaches cross-chain imports vitest cannot resolve.
 */

const { useProfile } = vi.hoisted(() => ({ useProfile: vi.fn() }))
vi.mock('~/hooks/useProfile', () => ({ useProfile }))

const fetchCatalogItems = vi.fn()
const fetchCreatorCollections = vi.fn()
vi.mock('~/lib/collections', () => ({
  fetchCatalogItems: (...args: unknown[]) => fetchCatalogItems(...args),
  fetchCreatorCollections: (...args: unknown[]) => fetchCreatorCollections(...args)
}))
vi.mock('~/hooks/useManaRate', () => ({ useManaRate: () => ({ data: undefined, isError: false, isPending: false }) }))
vi.mock('~/lib/analytics', () => ({ track: vi.fn(), errorCode: () => 'x', isUserRejection: () => false }))
vi.mock('~/components/CreatorHero', () => ({ CreatorHero: () => <div data-testid="creator-hero" /> }))
vi.mock('~/components/AssetCard', () => ({ AssetCard: () => <div data-testid="asset-card" /> }))

import { Creator } from '~/pages/Creator'

const CREATOR = '0xf2cb497ec3fe52d92b29466c0b369a1fee0199fd'
const FACE = 'https://profile-images.decentraland.org/entities/bafkreifwh73vkpuxgc/face.png'

function renderCreator() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/items/creator/${CREATOR}`]}>
        <Routes>
          <Route path="/items/creator/:address" element={<Creator />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

const prop = (key: string) => document.head.querySelector(`meta[property="${key}"]`)?.getAttribute('content')
const metaName = (key: string) => document.head.querySelector(`meta[name="${key}"]`)?.getAttribute('content')

beforeEach(() => {
  vi.clearAllMocks()
  fetchCatalogItems.mockResolvedValue({ items: [], total: 0 })
  fetchCreatorCollections.mockResolvedValue({ collections: [], total: 0 })
  document.head.innerHTML = `
    <meta property="og:image" content="/og-image.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:card" content="summary_large_image" />
  `
})

describe('Creator — the card a shared storefront link carries', () => {
  describe('when the creator has a profile with a face snapshot', () => {
    it("should share the creator's own avatar under their display name", async () => {
      useProfile.mockReturnValue({ data: { name: 'Metamoves', avatar: { snapshots: { face256: FACE } } } })

      renderCreator()

      await waitFor(() => expect(prop('og:image')).toBe(FACE))
      expect(prop('og:title')).toBe('Metamoves | Decentraland Shop')
      expect(prop('og:image:alt')).toBe('Metamoves')
      expect(metaName('twitter:card')).toBe('summary')
      expect(metaName('robots')).toBe('index,follow')
    })
  })

  describe('and the address has no profile', () => {
    it('should fall back to the default shop card', async () => {
      useProfile.mockReturnValue({ data: undefined })

      renderCreator()

      await waitFor(() => expect(prop('og:title')).toContain('Decentraland Shop'))
      expect(prop('og:image')).toContain('og-image.png')
      expect(metaName('twitter:card')).toBe('summary_large_image')
      expect(prop('og:image:width')).toBe('1200')
    })
  })
})
