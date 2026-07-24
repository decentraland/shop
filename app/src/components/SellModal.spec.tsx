import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// --- module mocks -------------------------------------------------------------------------------
const postTrade = vi.fn()
vi.mock('~/lib/api', () => ({ postTrade: (...a: unknown[]) => postTrade(...a) }))

const createUsdPeggedListing = vi.fn()
const ensureApproval = vi.fn()
vi.mock('~/lib/trades', () => ({
  createUsdPeggedListing: (...a: unknown[]) => createUsdPeggedListing(...a),
  ensureApproval: (...a: unknown[]) => ensureApproval(...a)
}))

const getAuthorizationStatus = vi.fn()
const setAuthorization = vi.fn()
vi.mock('~/lib/authorizations', () => ({
  getAuthorizationStatus: (...a: unknown[]) => getAuthorizationStatus(...a),
  setAuthorization: (...a: unknown[]) => setAuthorization(...a),
  getCollectionSellingAuthorization: (contractAddress: string, chainId: number) => ({
    id: `selling:${contractAddress.toLowerCase()}`,
    kind: 'approval',
    contractAddress,
    spenderAddress: '0xmarket',
    chainId
  })
}))

vi.mock('~/hooks/useProfile', () => ({ useProfile: () => ({ data: undefined }) }))
vi.mock('~/lib/collections', () => ({ fetchCollection: vi.fn() }))
vi.mock('~/store/toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('~/lib/analytics', () => ({ track: vi.fn(), errorCode: () => 'x' }))
vi.mock('~/lib/monitoring', () => ({ captureError: vi.fn() }))

import { SellModal } from '~/components/SellModal'

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

const asset = {
  contractAddress: '0xcoll',
  tokenId: '7',
  itemId: '3',
  name: 'Cool Hat',
  image: 'http://img',
  network: 'MATIC',
  chainId: 80002
} as never

function renderModal(providerType = 'injected') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const onClose = vi.fn()
  const onListed = vi.fn()
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <SellModal
          asset={asset}
          session={makeSession(providerType)}
          creator="0xcreator"
          onListed={onListed}
          onClose={onClose}
        />
      </MemoryRouter>
    </QueryClientProvider>
  )
  return { onListed }
}

beforeEach(() => {
  vi.clearAllMocks()
  getAuthorizationStatus.mockResolvedValue(false)
  setAuthorization.mockResolvedValue(undefined)
  createUsdPeggedListing.mockResolvedValue({ id: 'trade-1' })
  ensureApproval.mockResolvedValue(undefined)
  postTrade.mockResolvedValue(undefined)
})

describe('SellModal authorization step', () => {
  describe('when the wallet is self-custody and the approval is missing', () => {
    it('should show the approval step before listing, then list after authorizing', async () => {
      renderModal('injected')

      await userEvent.click(screen.getByRole('button', { name: /put up for sale/i }))

      // Advances to the approval step, NOT straight to the listing.
      const authorize = await screen.findByTestId('authorize-step-action')
      expect(createUsdPeggedListing).not.toHaveBeenCalled()

      // Authorizing grants (gasless) then advances to the actual listing.
      await userEvent.click(authorize)
      await waitFor(() => expect(setAuthorization).toHaveBeenCalledTimes(1))
      await waitFor(() => expect(createUsdPeggedListing).toHaveBeenCalledTimes(1))
    })
  })

  describe('when the wallet is self-custody and the collection is already approved', () => {
    it('should skip the step and list directly', async () => {
      getAuthorizationStatus.mockResolvedValue(true)
      renderModal('injected')

      await userEvent.click(screen.getByRole('button', { name: /put up for sale/i }))

      await waitFor(() => expect(createUsdPeggedListing).toHaveBeenCalledTimes(1))
      expect(screen.queryByTestId('authorize-step-action')).not.toBeInTheDocument()
      expect(setAuthorization).not.toHaveBeenCalled()
    })
  })

  describe('when the wallet is managed (web2)', () => {
    it('should never show the step and authorize silently inside the listing', async () => {
      getAuthorizationStatus.mockResolvedValue(false)
      renderModal('magic')

      await userEvent.click(screen.getByRole('button', { name: /put up for sale/i }))

      await waitFor(() => expect(createUsdPeggedListing).toHaveBeenCalledTimes(1))
      expect(screen.queryByTestId('authorize-step-action')).not.toBeInTheDocument()
      // No discrete step, and no pre-list status read — approval happens silently via ensureApproval.
      expect(getAuthorizationStatus).not.toHaveBeenCalled()
      expect(ensureApproval).toHaveBeenCalledTimes(1)
    })
  })
})
