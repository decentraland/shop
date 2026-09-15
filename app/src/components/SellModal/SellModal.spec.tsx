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

// PROCEEDS_TO_TREASURY defaults OFF here so these tests exercise today's behavior; the flag's
// beneficiary routing is covered in trades.spec.ts.
vi.mock('~/config', () => ({ config: { chainId: 80002, treasuryAddress: '' } }))
vi.mock('~/hooks/useProfile', () => ({ useProfile: () => ({ data: undefined }) }))
vi.mock('~/lib/collections', () => ({ fetchCollection: vi.fn() }))
vi.mock('~/store/toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('~/lib/analytics', () => ({ track: vi.fn(), errorCode: () => 'x' }))
vi.mock('~/lib/monitoring', () => ({ captureError: vi.fn() }))

import { SellModal } from '~/components/SellModal'
import type { ListingEdit } from '~/components/ListingSteps'

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

function renderModal(providerType = 'injected', edit?: ListingEdit) {
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
          edit={edit}
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

describe('SellModal edit price', () => {
  describe('when the seller submits a new price', () => {
    it('should take the current listing down first, then publish the new one', async () => {
      const calls: string[] = []
      const cancelCurrent = vi.fn(async () => {
        calls.push('cancel')
        return 'ok' as const
      })
      createUsdPeggedListing.mockImplementation(async () => {
        calls.push('list')
        return { id: 'trade-2' }
      })
      const { onListed } = renderModal('magic', { canPayGas: false, cancelCurrent })

      expect(screen.getByRole('dialog', { name: 'Edit price' })).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: /update price/i }))

      await waitFor(() => expect(onListed).toHaveBeenCalledWith(10, undefined))
      expect(calls).toEqual(['cancel', 'list'])
      expect(cancelCurrent).toHaveBeenCalledWith(expect.objectContaining({ payGas: undefined }))
      expect(screen.getByText('Your price is updated')).toBeInTheDocument()
    })
  })

  describe('when the price is unchanged', () => {
    it('should keep update price disabled until a different price is typed', async () => {
      renderModal('magic', { canPayGas: false, currentCredits: 10, cancelCurrent: vi.fn() })
      const submit = screen.getByRole('button', { name: /update price/i })
      expect(submit).toBeDisabled()
      await userEvent.clear(screen.getByTestId('price-input'))
      await userEvent.type(screen.getByTestId('price-input'), '12')
      expect(submit).toBeEnabled()
    })
  })

  describe('when taking the current listing down fails', () => {
    it('should not publish the new price and should show the failure', async () => {
      const cancelCurrent = vi.fn(async () => {
        throw new Error('boom')
      })
      renderModal('magic', { canPayGas: false, cancelCurrent })

      await userEvent.click(screen.getByRole('button', { name: /update price/i }))

      await screen.findByRole('alert')
      expect(createUsdPeggedListing).not.toHaveBeenCalled()
      expect(screen.getByRole('button', { name: /update price/i })).toBeEnabled()
    })
  })

  describe('when the fee-less removal is not confirmed', () => {
    it('should offer the pay-the-fee option only to a seller who can pay it', async () => {
      const cancelCurrent = vi.fn<ListingEdit['cancelCurrent']>().mockResolvedValue('relay-pending')
      renderModal('injected', { canPayGas: true, cancelCurrent })
      getAuthorizationStatus.mockResolvedValue(true)

      await userEvent.click(screen.getByRole('button', { name: /update price/i }))

      await screen.findByTestId('edit-cancel-relay-failed')
      expect(createUsdPeggedListing).not.toHaveBeenCalled()

      cancelCurrent.mockResolvedValue('ok')
      await userEvent.click(screen.getByRole('button', { name: /pay the fee/i }))
      await waitFor(() => expect(cancelCurrent).toHaveBeenLastCalledWith(expect.objectContaining({ payGas: true })))
      await waitFor(() => expect(createUsdPeggedListing).toHaveBeenCalledTimes(1))
    })
  })

  describe('when the new price fails to publish after the listing was taken down', () => {
    it('should retry only the publish half', async () => {
      const cancelCurrent = vi.fn(async () => 'ok' as const)
      createUsdPeggedListing.mockRejectedValueOnce(new Error('nope'))
      renderModal('magic', { canPayGas: false, cancelCurrent })

      await userEvent.click(screen.getByRole('button', { name: /update price/i }))
      await screen.findByRole('alert')

      await userEvent.click(screen.getByRole('button', { name: /put up for sale/i }))
      await waitFor(() => expect(createUsdPeggedListing).toHaveBeenCalledTimes(2))
      expect(cancelCurrent).toHaveBeenCalledTimes(1)
    })
  })
})
