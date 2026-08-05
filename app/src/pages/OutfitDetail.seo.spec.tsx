import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

/**
 * AN OUTFIT'S SHARED CARD.
 *
 * An outfit is a look someone assembled and wants to show off, so a shared link that renders the generic
 * shop image wastes the whole point. The outfit already stores a rendered thumbnail server-side; this pins
 * that the page puts THAT on the card — and that a draft, which has no stored thumbnail, falls back to the
 * default instead of building a URL out of an empty hash.
 */

const { fetchOutfit, thumbnailUrl } = vi.hoisted(() => ({ fetchOutfit: vi.fn(), thumbnailUrl: vi.fn() }))
vi.mock('~/lib/outfits', async importOriginal => {
  const actual = await importOriginal<typeof import('~/lib/outfits')>()
  return { ...actual, fetchOutfit, thumbnailUrl, isOutfitsAvailable: () => true }
})

// The live 3D preview and the try-on rig are a different concern with their own coverage; they also pull
// the wearable-preview iframe, which has no business booting in a head-tag test.
vi.mock('~/components/OutfitPreview', () => ({ OutfitPreview: () => <div data-testid="preview" /> }))
vi.mock('~/hooks/useTryOnAvatar', () => ({ useTryOnAvatar: () => ({ avatar: undefined, isLoading: false }) }))
vi.mock('~/hooks/useProfile', () => ({ useProfile: () => ({ data: undefined }) }))
vi.mock('~/hooks/useOutfits', () => ({
  useOutfitCreatorAccess: () => 'viewer',
  useOutfitItems: () => ({ byKey: new Map(), isLoading: false, isError: false }),
  useOutfitCart: () => ({
    split: { purchasable: [], owned: [], inCart: [], ownListing: [], unavailable: [] },
    availableCount: 0,
    totalCredits: 0,
    addOutfit: vi.fn(),
    isAdding: false
  })
}))
vi.mock('~/lib/analytics', () => ({ track: vi.fn(), itemProps: () => ({}) }))

import { OutfitDetail } from '~/pages/OutfitDetail'

const HASH = 'a'.repeat(64)
const THUMB = `https://shop-api.decentraland.org/v1/outfits/thumbnails/${HASH}`

function outfit(overrides: Record<string, unknown> = {}) {
  return {
    id: 'out-1',
    name: 'Neon Runner',
    thumbnailHash: HASH,
    creator: '0xcreator',
    items: [],
    published: true,
    ...overrides
  }
}

function renderOutfit() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/items/outfits/out-1']}>
        <Routes>
          <Route path="/items/outfits/:id" element={<OutfitDetail />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

const prop = (key: string) => document.head.querySelector(`meta[property="${key}"]`)?.getAttribute('content')
const metaName = (key: string) => document.head.querySelector(`meta[name="${key}"]`)?.getAttribute('content')

beforeEach(() => {
  vi.clearAllMocks()
  document.head.innerHTML = `
    <meta property="og:image" content="/og-image.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:card" content="summary_large_image" />
  `
})

describe('OutfitDetail — the card a shared outfit link carries', () => {
  describe('when the outfit has a stored thumbnail', () => {
    it("should share the outfit's own render", async () => {
      thumbnailUrl.mockReturnValue(THUMB)
      fetchOutfit.mockResolvedValue(outfit())

      renderOutfit()

      await waitFor(() => expect(prop('og:image')).toBe(THUMB))
      expect(prop('og:title')).toBe('Neon Runner | Decentraland Shop')
      expect(prop('og:image:alt')).toBe('Neon Runner')
      expect(metaName('twitter:card')).toBe('summary')
    })
  })

  describe('and the outfit is a draft with no usable thumbnail hash', () => {
    it('should fall back to the default shop card rather than an unbuildable URL', async () => {
      // thumbnailUrl() returns null for a hash it refuses to interpolate.
      thumbnailUrl.mockReturnValue(null)
      fetchOutfit.mockResolvedValue(outfit({ thumbnailHash: '' }))

      renderOutfit()

      await waitFor(() => expect(prop('og:title')).toBe('Neon Runner | Decentraland Shop'))
      expect(prop('og:image')).toContain('og-image.png')
      expect(metaName('twitter:card')).toBe('summary_large_image')
      expect(prop('og:image:width')).toBe('1200')
    })
  })
})
