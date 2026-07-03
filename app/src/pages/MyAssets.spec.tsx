import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const session = {
  address: '0xabc0000000000000000000000000000000000abc',
  chainId: 80002,
  signer: {} as never,
  web3Provider: {} as never,
  identity: {} as never,
  providerType: 'injected' as never
}

vi.mock('~/store/wallet', () => ({
  useWallet: () => ({
    session,
    connecting: false,
    error: null,
    signIn: vi.fn(),
    restore: vi.fn(),
    disconnect: vi.fn()
  })
}))

const fetchMyAssets = vi.fn()
const postTrade = vi.fn()
const fetchTrade = vi.fn()
vi.mock('~/lib/api', () => ({
  fetchMyAssets: (...args: unknown[]) => fetchMyAssets(...args),
  postTrade: (...args: unknown[]) => postTrade(...args),
  fetchTrade: (...args: unknown[]) => fetchTrade(...args)
}))

// Stub the on-chain cancel so importing MyAssets doesn't pull the heavy decentraland-transactions ESM.
vi.mock('~/lib/buy', () => ({ cancelListing: vi.fn() }))
// Same for the import lib (pulls decentraland-transactions). No importable listings in this test.
vi.mock('~/lib/import', () => ({ fetchImportable: vi.fn().mockResolvedValue({ creations: [], owned: [] }) }))

const createUsdPeggedListing = vi.fn()
const ensureApproval = vi.fn()
vi.mock('~/lib/trades', () => ({
  createUsdPeggedListing: (...args: unknown[]) => createUsdPeggedListing(...args),
  ensureApproval: (...args: unknown[]) => ensureApproval(...args)
}))

// eslint-disable-next-line import/first
import { MyAssets } from '~/pages/MyAssets'

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <MyAssets />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('when a connected user lists one of their assets', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fetchMyAssets.mockResolvedValue({
      assets: [
        {
          id: '0xcollection-1',
          contractAddress: '0xcollection',
          tokenId: '1',
          itemId: null,
          name: 'Cool Hat',
          category: 'wearable',
          image: '',
          network: 'matic',
          chainId: 80002,
          isOnSale: false
        }
      ],
      total: 1
    })
    ensureApproval.mockResolvedValue(undefined)
    createUsdPeggedListing.mockResolvedValue({ signer: session.address, signature: '0xsig', type: 'public_nft_order' })
    postTrade.mockResolvedValue({ id: 'trade-1' })
  })

  it('should approve the collection, sign a USD-pegged listing and publish it', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: /list for sale/i }))

    const dialog = await screen.findByRole('dialog')
    const price = within(dialog).getByLabelText(/price/i)
    await user.clear(price)
    await user.type(price, '5')
    await user.click(within(dialog).getByRole('button', { name: /list for sale/i }))

    expect(await within(dialog).findByText(/on sale!/i)).toBeInTheDocument()
    expect(ensureApproval).toHaveBeenCalledTimes(1)
    expect(createUsdPeggedListing).toHaveBeenCalledWith(
      expect.objectContaining({
        usdPrice: 5,
        nft: expect.objectContaining({ contractAddress: '0xcollection', tokenId: '1', chainId: 80002 })
      })
    )
    expect(postTrade).toHaveBeenCalledWith(expect.objectContaining({ type: 'public_nft_order' }), session.identity)
  })
})
