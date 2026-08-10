import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useOutfitCart, useOutfitCreatorAccess, useOutfitItems } from '~/hooks/useOutfits'
import { fetchCatalogByIds, fetchShopItems, type CatalogItem, type UnifiedListing } from '~/lib/api'
import { resetFeatureFlagsCache } from '~/lib/featureFlags'
import type { Outfit } from '~/lib/outfits'
import { useCart } from '~/store/cart'
import { useToast } from '~/store/toast'
import { useWallet } from '~/store/wallet'

// The two feeds an outfit crosses: the batched catalog the cards render from, and the shop feed the
// CTA re-reads before anything becomes a cart line.
vi.mock('~/lib/api', async importOriginal => {
  const actual = await importOriginal<typeof import('~/lib/api')>()
  return { ...actual, fetchCatalogByIds: vi.fn(), fetchShopItems: vi.fn() }
})

// The live MANA rate the /v2 rows are priced at. Stubbed because the real hook reads the on-chain
// oracle through `decentraland-transactions`, whose ESM directory imports vitest cannot resolve.
const { manaRate } = vi.hoisted(() => ({
  manaRate: { data: { rate: 26960836n, decimals: 8 }, isLoading: false, isError: false, refetch: vi.fn() }
}))
vi.mock('~/hooks/useManaRate', () => ({ useManaRate: () => manaRate }))

// The studio is hidden entirely when there is no shop-server to author against, so every case here
// needs a configured host to be about the allowlist rather than about availability.
vi.mock('~/config', async importOriginal => {
  const actual = await importOriginal<typeof import('~/config')>()
  return { config: { ...actual.config, shopServerUrl: 'https://shop-server.example.com' } }
})

const CREATOR = '0xaabbccddeeff00112233445566778899aabbccdd'
const OTHER = '0x1111111111111111111111111111111111111111'

function mockFlagService(body: unknown, ok = true) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok, json: () => Promise.resolve(body) }))
}

const armed = (addresses: string) => ({
  flags: { 'dapps-shop-outfit-creators': true },
  variants: { 'dapps-shop-outfit-creators': { enabled: true, payload: { value: addresses } } }
})

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

async function settledAccess() {
  const { result } = renderHook(() => useOutfitCreatorAccess(), { wrapper })
  await waitFor(() => expect(result.current).not.toBe('pending'))
  await new Promise(resolve => setTimeout(resolve, 0))
  return result
}

describe('useOutfitCreatorAccess', () => {
  beforeEach(() => {
    // Vite loads .env.local in EVERY mode, and `import.meta.env.DEV` is true under vitest — so a
    // developer's own studio overrides would otherwise decide these cases instead of the mocked
    // service, silently. Neutralised with empty strings, which both override readers treat as absent.
    vi.stubEnv('VITE_FEATURE_FLAG_OVERRIDES', '')
    vi.stubEnv('VITE_FEATURE_FLAG_VARIANT_OVERRIDES', '')
    resetFeatureFlagsCache()
    useWallet.setState({ session: null, restored: true })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('should admit an allowlisted account', async () => {
    mockFlagService(armed(CREATOR))
    useWallet.setState({ session: { address: CREATOR }, restored: true } as never)

    const result = await settledAccess()

    expect(result.current).toBe('creator')
  })

  it('should match the allowlist case-insensitively, since a wallet reports a checksummed address', async () => {
    mockFlagService(armed(CREATOR))
    useWallet.setState({
      session: { address: CREATOR.toUpperCase().replace('0X', '0x') },
      restored: true
    } as never)

    const result = await settledAccess()

    expect(result.current).toBe('creator')
  })

  it('should deny an account that is not on the list', async () => {
    mockFlagService(armed(CREATOR))
    useWallet.setState({ session: { address: OTHER }, restored: true } as never)

    const result = await settledAccess()

    expect(result.current).toBe('denied')
  })

  it('should deny everyone while the flag is off, list or no list', async () => {
    mockFlagService({ flags: {}, variants: {} })
    useWallet.setState({ session: { address: CREATOR }, restored: true } as never)

    const result = await settledAccess()

    expect(result.current).toBe('denied')
  })

  // FAILS CLOSED, the opposite of useShopPrelaunch: showing the studio is the positive condition
  // here, so an outage hides it. Harmless — shop-server refuses the writes regardless.
  it('should deny when the flag service is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))
    useWallet.setState({ session: { address: CREATOR }, restored: true } as never)

    const result = await settledAccess()

    expect(result.current).toBe('denied')
  })

  /**
   * The flash. A creator saw the sign-in gate, then the not-available gate, for a moment on every
   * refresh of the studio: the flag resolves over the network while the session is read back from
   * storage independently, so for one render there was no address — indistinguishable from signed
   * out. Deliberately not using `settledAccess()`, since 'pending' is what this asserts.
   */
  it('should withhold the verdict while the session is still being restored', async () => {
    useWallet.setState({ session: null, restored: false })
    mockFlagService(armed(CREATOR))

    const { result } = renderHook(() => useOutfitCreatorAccess(), { wrapper })

    // Long enough for the flag query to settle. No address is known yet — the old code answered
    // "not a creator" here, which is the frame the user saw.
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(result.current).toBe('pending')

    act(() => {
      useWallet.setState({ session: { address: CREATOR }, restored: true } as never)
    })
    await waitFor(() => expect(result.current).toBe('creator'))
  })

  it('should answer a signed-out visitor without waiting on the flag fetch', async () => {
    // A restore that finds nothing must not leave the studio spinning, and the public detail page
    // reads this hook too — making it wait on a network round-trip to learn that nobody is signed
    // in would delay a page that has no stake in the answer.
    let resolveFlags: (value: unknown) => void = () => {}
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(resolve => (resolveFlags = resolve))))
    useWallet.setState({ session: null, restored: false })

    const { result } = renderHook(() => useOutfitCreatorAccess(), { wrapper })
    expect(result.current).toBe('pending')

    act(() => {
      useWallet.setState({ session: null, restored: true })
    })

    // Decided with the flag request still in flight.
    await waitFor(() => expect(result.current).toBe('denied'))
    resolveFlags({ ok: true, json: () => Promise.resolve(armed(CREATOR)) })
  })
})

// The regression this guards: an outfit card resolves its items from the /v2 catalog, whose rows
// carry no `acquisition`, `tradeId` or `available`. Adding THOSE rows to the cart produced a line
// checkout could not take the right rail for — a CollectionStore mint, having no trade to resolve,
// read as sold-out in the cart it had just been added to. The CTA must re-read from the shop feed
// and add that row instead.
describe('useOutfitCart', () => {
  const CONTRACT = '0x' + 'a'.repeat(40)

  const OUTFIT: Outfit = {
    id: 'aaaaaaaa-0000-4000-8000-000000000001',
    name: 'Galaxy Look',
    thumbnailHash: 'a'.repeat(64),
    items: [{ contractAddress: CONTRACT, itemId: '1' }],
    bodyShape: 'unisex',
    gradientFrom: '#a855f7',
    gradientTo: '#e0219a',
    authorAddress: CREATOR,
    published: true,
    createdAt: 1,
    updatedAt: 1
  }

  // What /v2/catalog gives the card: keyed by `contract-itemId`, no listing detail whatsoever.
  const DISPLAY_ROW = {
    id: `${CONTRACT}-1`,
    name: 'Galaxy Hat',
    creator: CREATOR,
    contractAddress: CONTRACT,
    itemId: '1',
    category: 'wearable',
    rarity: 'epic',
    network: 'MATIC',
    chainId: 80002,
    thumbnail: '',
    priceCredits: 270,
    gender: null,
    isSmart: false
  } as CatalogItem

  // What the shop feed gives the CTA: the row the browse grid would have put in the cart.
  const SHOP_ROW: UnifiedListing = {
    ...DISPLAY_ROW,
    id: 'trade-9',
    tradeId: 'trade-9',
    acquisition: 'store',
    available: 5,
    source: 'native',
    manaWei: null
  }

  function useHarness() {
    const resolution = useOutfitItems(OUTFIT)
    return { resolution, cart: useOutfitCart(OUTFIT, resolution) }
  }

  beforeEach(() => {
    useCart.setState({ items: [], open: false, justAddedCount: 0 })
    useWallet.setState({ session: null, restored: true })
    vi.mocked(fetchCatalogByIds).mockResolvedValue([DISPLAY_ROW])
    vi.mocked(fetchShopItems).mockReset()
  })

  it('should put the shop-feed row in the cart, not the catalog row the card rendered', async () => {
    vi.mocked(fetchShopItems).mockResolvedValue({ items: [SHOP_ROW], total: 1 })

    const { result } = renderHook(useHarness, { wrapper })
    await waitFor(() => expect(result.current.cart.split.purchasable).toHaveLength(1))
    // The card priced itself off the catalog row, which knows nothing about how the item is bought.
    expect(result.current.cart.split.purchasable[0].acquisition).toBeUndefined()

    act(() => result.current.cart.addOutfit())
    await waitFor(() => expect(useCart.getState().items).toHaveLength(1))

    const line = useCart.getState().items[0]
    expect(line.acquisition).toBe('store')
    expect(line.tradeId).toBe('trade-9')
    expect(line.available).toBe(5)
  })

  it('should add nothing when the listing read fails — an outage is not a sell-out', async () => {
    vi.mocked(fetchShopItems).mockRejectedValue(new Error('gateway down'))

    const { result } = renderHook(useHarness, { wrapper })
    await waitFor(() => expect(result.current.cart.split.purchasable).toHaveLength(1))

    act(() => result.current.cart.addOutfit())
    await waitFor(() => expect(result.current.cart.isAdding).toBe(false))

    expect(useCart.getState().items).toHaveLength(0)
    expect(useToast.getState().toasts.some(t => t.kind === 'error')).toBe(true)
  })

  it('should drop an item that minted out between the card rendering and the click', async () => {
    vi.mocked(fetchShopItems).mockResolvedValue({ items: [{ ...SHOP_ROW, available: 0 }], total: 1 })

    const { result } = renderHook(useHarness, { wrapper })
    await waitFor(() => expect(result.current.cart.split.purchasable).toHaveLength(1))

    act(() => result.current.cart.addOutfit())
    await waitFor(() => expect(result.current.cart.isAdding).toBe(false))

    expect(useCart.getState().items).toHaveLength(0)
  })
  /**
   * A look's price and the basket it would build are different numbers, and one value used to serve
   * both. On zone, "Other test" holds a 14-credit item the viewer created and a 1-credit item they did
   * not, and the page reported "Total price 1" — the buyable remainder wearing the look's label.
   */
  describe("and one item in the look is the viewer's own primary listing", () => {
    const OWN = { ...DISPLAY_ROW, id: `${CONTRACT}-1`, itemId: '1', creator: CREATOR, priceCredits: 14 } as CatalogItem
    const THEIRS = { ...DISPLAY_ROW, id: `${CONTRACT}-2`, itemId: '2', creator: OTHER, priceCredits: 1 } as CatalogItem
    const PAIR: Outfit = {
      ...OUTFIT,
      items: [
        { contractAddress: CONTRACT, itemId: '1' },
        { contractAddress: CONTRACT, itemId: '2' }
      ]
    }

    function usePairHarness() {
      const resolution = useOutfitItems(PAIR)
      return { resolution, cart: useOutfitCart(PAIR, resolution) }
    }

    beforeEach(() => {
      // Signed in AS the creator, so their own primary drops out of the basket.
      useWallet.setState({ session: { address: CREATOR } as never, restored: true })
      vi.mocked(fetchCatalogByIds).mockResolvedValue([OWN, THEIRS])
    })

    it('should price the look at every item it contains, including the one that cannot be bought', async () => {
      const { result } = renderHook(usePairHarness, { wrapper })
      await waitFor(() => expect(result.current.cart.split.ownListing).toHaveLength(1))

      expect(result.current.cart.outfitCredits).toBe(15)
    })

    it('should still charge the CTA only for what it would add', async () => {
      const { result } = renderHook(usePairHarness, { wrapper })
      await waitFor(() => expect(result.current.cart.split.ownListing).toHaveLength(1))

      expect(result.current.cart.totalCredits).toBe(1)
    })
  })
})
