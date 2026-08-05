import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

/**
 * THE SECONDARY-SALES FLAG, ON A TOKEN THE VIEWER OWNS AND HAS ALREADY LISTED.
 *
 * The shop is primary-sales only while `shop-secondary-sales` is off — and the flag is absent from the dapps
 * flag file, so it reads false in every environment today. Hiding "Put up for sale" was not enough: the page
 * still offered **Edit price** on an existing listing, and `updatePrice` cancels and re-lists, which creates a
 * brand-new secondary listing. So the flag stopped a first listing and waved through every replacement — found
 * on .zone, on a real token, with the flag off.
 *
 * The rule these tests pin: with the flag off the EXIT stays open (Remove) and every ENTRANCE is shut (list,
 * re-price). Hiding Remove too would trap an owner with a listing they cannot take down.
 */

vi.mock('decentraland-transactions', () => ({
  ContractName: { CreditsManager: 'CreditsManager', CollectionStore: 'CollectionStore' },
  getContractName: () => 'DecentralandMarketplacePolygon',
  getContract: (name: string) => ({ address: `0x${name}`, name, version: '1', abi: [] }),
  sendMetaTransaction: vi.fn(),
  MetaTransactionError: class MetaTransactionError extends Error {},
  ErrorCode: { USER_DENIED: 'USER_DENIED' }
}))

vi.mock('decentraland-ui2', () => ({
  CircularProgress: ({ size }: { size?: number }) => <span role="progressbar" data-size={size} />
}))

const CONTRACT = '0xanchor'
const OWNER = '0xabc0000000000000000000000000000000000abc'
const TOKEN_ID = '526561458342785933489590138418352161594475477002745556271554887681'

const session = {
  address: OWNER,
  chainId: 80002,
  signer: {} as never,
  web3Provider: {} as never,
  identity: {} as never,
  providerType: 'injected' as never
}
const walletState = {
  session,
  connecting: false,
  error: null,
  signIn: vi.fn(),
  restore: vi.fn(),
  disconnect: vi.fn()
}
vi.mock('~/store/wallet', () => ({
  useWallet: Object.assign((sel?: (s: typeof walletState) => unknown) => (sel ? sel(walletState) : walletState), {
    getState: () => walletState
  })
}))

vi.mock('~/lib/analytics', async importOriginal => ({
  ...(await importOriginal<typeof import('~/lib/analytics')>()),
  track: vi.fn()
}))

// The token the viewer owns, already on sale — the state that used to expose the re-price entrance.
const { fetchOwnedToken, fetchTokenById } = vi.hoisted(() => ({
  fetchOwnedToken: vi.fn(),
  fetchTokenById: vi.fn()
}))
vi.mock('~/lib/api', () => ({
  fetchShopListingForItem: vi.fn().mockResolvedValue(null),
  fetchTradeForItem: vi.fn().mockResolvedValue(null),
  fetchTrade: vi.fn().mockResolvedValue(null),
  fetchItemResales: vi.fn().mockResolvedValue([]),
  fetchItemDescription: vi.fn().mockResolvedValue(''),
  fetchOwnedToken,
  fetchOwnedItemCount: vi.fn().mockResolvedValue(0),
  fetchTokenById,
  usdWeiToCents: () => 0
}))

vi.mock('~/lib/buy', () => ({
  cancelListing: vi.fn(),
  GaslessCancelFailedError: class GaslessCancelFailedError extends Error {}
}))

vi.mock('~/lib/collections', () => ({
  fetchCollectionItems: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  // Literals, not the consts below: `vi.mock` is hoisted above them.
  fetchCollection: vi.fn().mockResolvedValue({
    contractAddress: '0xanchor',
    name: 'Solo Collection',
    creator: '0xabc0000000000000000000000000000000000abc'
  })
}))
vi.mock('~/lib/builder', () => ({ fetchPublishableItems: vi.fn().mockResolvedValue([]) }))
vi.mock('~/hooks/useRelatedItems', () => ({ useRelatedItems: () => ({ items: [], isFetched: true }) }))
vi.mock('~/hooks/useManaRate', () => ({ useManaRate: () => ({ data: undefined, isError: false }) }))

// Mutable so both flag states are reachable — the whole point is the difference between them.
const secondary = { enabled: false }
vi.mock('~/hooks/useSecondarySales', () => ({ useSecondarySales: () => secondary.enabled }))

import { ItemDetail } from '~/pages/ItemDetail'

const ownedListedToken = () => ({
  id: `${CONTRACT}-${TOKEN_ID}`,
  contractAddress: CONTRACT,
  tokenId: TOKEN_ID,
  itemId: '1',
  name: 'Ruby Red Fascinator',
  thumbnail: '',
  rarity: 'rare',
  category: 'wearable',
  isOnSale: true,
  listingPrice: 5,
  tradeId: 'secondary-trade-1'
})

function renderTokenPdp() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/token/${CONTRACT}/${TOKEN_ID}`]}>
        <Routes>
          <Route path="/token/:contractAddress/:tokenId" element={<ItemDetail />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

const editPriceCta = () => screen.queryByRole('button', { name: /edit price/i })
const removeCta = () => screen.queryByRole('button', { name: /remove from sale/i })
const listCta = () => screen.queryByRole('button', { name: /put up for sale/i })

beforeEach(() => {
  vi.clearAllMocks()
  secondary.enabled = false
  fetchOwnedToken.mockResolvedValue(ownedListedToken())
  fetchTokenById.mockResolvedValue(ownedListedToken())
})

describe('ItemDetail — an owned, listed token while secondary sales are off', () => {
  it('should let the owner remove the listing', async () => {
    renderTokenPdp()

    // The exit stays open: an owner must always be able to take their own listing down.
    expect(await screen.findByTestId('manage-actions')).toBeInTheDocument()
    expect(removeCta()).toBeInTheDocument()
  })

  it('should NOT offer to re-price it', async () => {
    renderTokenPdp()

    await screen.findByTestId('manage-actions')
    // Re-pricing cancels and re-lists, so it creates a NEW secondary listing — an entrance, not an exit.
    expect(editPriceCta()).not.toBeInTheDocument()
  })

  it('should not offer to list it either', async () => {
    fetchOwnedToken.mockResolvedValue({ ...ownedListedToken(), isOnSale: false, tradeId: null })
    fetchTokenById.mockResolvedValue({ ...ownedListedToken(), isOnSale: false, tradeId: null })

    renderTokenPdp()

    await screen.findByTestId('manage-actions')
    expect(listCta()).not.toBeInTheDocument()
  })
})

describe('ItemDetail — an owned, listed token once secondary sales are on', () => {
  beforeEach(() => {
    secondary.enabled = true
  })

  it('should offer both re-pricing and removal', async () => {
    renderTokenPdp()

    await screen.findByTestId('manage-actions')
    expect(editPriceCta()).toBeInTheDocument()
    expect(removeCta()).toBeInTheDocument()
  })
})
