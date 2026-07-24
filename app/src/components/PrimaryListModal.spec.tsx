import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// --- module mocks -------------------------------------------------------------------------------
const postTrade = vi.fn()
vi.mock('~/lib/api', () => ({ postTrade: (...a: unknown[]) => postTrade(...a) }))

const createPrimaryUsdPeggedListing = vi.fn()
const ensureMinter = vi.fn()
const isMarketplaceMinter = vi.fn()
vi.mock('~/lib/trades', () => ({
  createPrimaryUsdPeggedListing: (...a: unknown[]) => createPrimaryUsdPeggedListing(...a),
  ensureMinter: (...a: unknown[]) => ensureMinter(...a),
  isMarketplaceMinter: (...a: unknown[]) => isMarketplaceMinter(...a)
}))

vi.mock('~/config', () => ({ config: { chainId: 80002 } }))
vi.mock('~/hooks/useProfile', () => ({ useProfile: () => ({ data: undefined }) }))
vi.mock('~/store/toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('~/lib/analytics', () => ({ track: vi.fn(), errorCode: () => 'x' }))
vi.mock('~/lib/monitoring', () => ({ captureError: vi.fn() }))

import { PrimaryListModal } from '~/components/PrimaryListModal'

function makeSession(providerType: string) {
  return {
    address: '0xabc0000000000000000000000000000000000abc',
    chainId: 80002,
    signer: { tag: 'signer' } as never,
    web3Provider: {} as never,
    identity: {} as never,
    providerType: providerType as never
  }
}

const item = {
  id: 'uuid-1',
  collectionId: 'coll-1',
  collectionName: 'My Cool Collection',
  contractAddress: '0xcoll',
  blockchainItemId: '3',
  name: 'Cool Hat',
  category: 'hat',
  rarity: 'rare',
  thumbnail: 'http://img',
  type: 'wearable',
  isPublished: true,
  isApproved: true,
  totalSupply: 0,
  maxSupply: 100,
  remainingSupply: 100,
  minters: []
} as never

function renderModal(providerType = 'injected') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const onClose = vi.fn()
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <PrimaryListModal item={item} session={makeSession(providerType)} onClose={onClose} />
      </MemoryRouter>
    </QueryClientProvider>
  )
  return { onClose }
}

beforeEach(() => {
  vi.clearAllMocks()
  isMarketplaceMinter.mockResolvedValue(true)
  createPrimaryUsdPeggedListing.mockResolvedValue({ id: 'trade-1' })
  ensureMinter.mockResolvedValue(undefined)
  postTrade.mockResolvedValue(undefined)
})

describe('PrimaryListModal', () => {
  describe('when the collection is already a minter', () => {
    it('should publish the primary listing without enabling the collection', async () => {
      renderModal('injected')

      // Idle CTA reflects the ready collection (not the enable variant).
      const cta = await screen.findByRole('button', { name: /^put on sale$/i })
      await userEvent.click(cta)

      await waitFor(() => expect(createPrimaryUsdPeggedListing).toHaveBeenCalledTimes(1))
      expect(ensureMinter).not.toHaveBeenCalled()
      // 10 credits default → $1.00 USD (1 credit = $0.10).
      expect(createPrimaryUsdPeggedListing).toHaveBeenCalledWith(expect.objectContaining({ usdPrice: 1 }))
      // Success screen shows the "View in Shop" action.
      await screen.findByRole('button', { name: /view in shop/i })
    })
  })

  describe('when the collection is not yet a minter', () => {
    it('should enable the collection first, and the CTA offers to enable & put on sale', async () => {
      isMarketplaceMinter.mockResolvedValue(false)
      renderModal('injected')

      const cta = await screen.findByRole('button', { name: /enable & put on sale/i })
      await userEvent.click(cta)

      await waitFor(() => expect(ensureMinter).toHaveBeenCalledTimes(1))
      await waitFor(() => expect(createPrimaryUsdPeggedListing).toHaveBeenCalledTimes(1))
    })
  })

  describe('when the wallet is managed (web2)', () => {
    it('should show the "Publishing…" busy label while the listing is in flight', async () => {
      let resolveListing: (v: unknown) => void = () => {}
      createPrimaryUsdPeggedListing.mockReturnValue(
        new Promise(res => {
          resolveListing = res
        })
      )
      renderModal('magic')

      const cta = await screen.findByRole('button', { name: /^put on sale$/i })
      await userEvent.click(cta)

      // Managed wallet → transient busy label is "Publishing…", never "Confirm listing".
      await screen.findByRole('button', { name: /publishing…/i })
      expect(screen.queryByRole('button', { name: /confirm listing/i })).not.toBeInTheDocument()

      resolveListing({ id: 'trade-1' })
      await waitFor(() => expect(postTrade).toHaveBeenCalledTimes(1))
    })
  })

  describe('when the wallet is self-custody', () => {
    it('should show the "Confirm listing" busy label while the listing is in flight', async () => {
      let resolveListing: (v: unknown) => void = () => {}
      createPrimaryUsdPeggedListing.mockReturnValue(
        new Promise(res => {
          resolveListing = res
        })
      )
      renderModal('injected')

      const cta = await screen.findByRole('button', { name: /^put on sale$/i })
      await userEvent.click(cta)

      await screen.findByRole('button', { name: /confirm listing/i })
      expect(screen.queryByRole('button', { name: /publishing…/i })).not.toBeInTheDocument()

      resolveListing({ id: 'trade-1' })
      await waitFor(() => expect(postTrade).toHaveBeenCalledTimes(1))
    })
  })
})
