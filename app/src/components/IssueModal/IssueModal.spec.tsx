import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// --- module mocks -------------------------------------------------------------------------------
// decentraland-transactions' ESM build can't be directory-imported under vitest; mock it so the real
// ~/lib/issue (loaded via importActual below) resolves. The pure helpers we keep don't use it.
vi.mock('decentraland-transactions', () => ({
  ContractName: { ERC721CollectionV2: 'ERC721CollectionV2' },
  getContractName: () => 'DecentralandMarketplacePolygon',
  getContract: () => ({ address: '0xcollection', abi: [], name: 'Decentraland Collection', version: '2' }),
  sendMetaTransaction: vi.fn(() => Promise.resolve('0xrelayhash')),
  MetaTransactionError: class extends Error {},
  ErrorCode: { USER_DENIED: 'USER_DENIED' }
}))
vi.mock('~/config', () => ({ config: { chainId: 80002, rpcUrl: 'http://localhost' } }))

const issueTokens = vi.fn()
vi.mock('~/lib/issue', async () => {
  // Keep the real pure helpers (validation/array-building) so the modal gates exactly like production;
  // only the on-chain issueTokens is stubbed.
  const actual = await vi.importActual<typeof import('~/lib/issue')>('~/lib/issue')
  return { ...actual, issueTokens: (...a: unknown[]) => issueTokens(...a) }
})

vi.mock('~/store/toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('~/lib/analytics', () => ({ track: vi.fn(), errorCode: () => 'x' }))
vi.mock('~/lib/monitoring', () => ({ captureError: vi.fn() }))

import { IssueModal, type IssueTarget } from '~/components/IssueModal'

const A = '0x1111111111111111111111111111111111111111'
const B = '0x2222222222222222222222222222222222222222'

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

const item: IssueTarget = {
  contractAddress: '0xcoll',
  chainId: 80002,
  itemId: '3',
  name: 'Cool Hat',
  thumbnail: 'http://img',
  available: 5
}

function renderModal(providerType = 'injected', onClose = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <IssueModal item={item} session={makeSession(providerType)} onClose={onClose} />
    </QueryClientProvider>
  )
  return { onClose }
}

beforeEach(() => {
  vi.clearAllMocks()
  issueTokens.mockResolvedValue('0xhash')
})

describe('IssueModal', () => {
  it('should render the dialog with one recipient row and disable submit until valid', () => {
    renderModal()
    expect(screen.getByRole('dialog', { name: /issue copies/i })).toBeInTheDocument()
    // One row seeded with a default amount of 1, but no address yet → submit stays disabled.
    expect(screen.getByRole('button', { name: /issue 1 copy/i })).toBeDisabled()
  })

  it('should batch all rows into ONE issueTokens call with repeated beneficiaries', async () => {
    renderModal('injected')

    const addresses = screen.getAllByLabelText(/user id/i)
    const amounts = screen.getAllByLabelText(/amount/i)
    await userEvent.type(addresses[0], A)
    await userEvent.clear(amounts[0])
    await userEvent.type(amounts[0], '2')

    // Add a second recipient.
    await userEvent.click(screen.getByRole('button', { name: /add recipient/i }))
    const addresses2 = screen.getAllByLabelText(/user id/i)
    const amounts2 = screen.getAllByLabelText(/amount/i)
    await userEvent.type(addresses2[1], B)
    await userEvent.clear(amounts2[1])
    await userEvent.type(amounts2[1], '1')

    // Running total reflects 3 / 5.
    expect(screen.getByText('3')).toBeInTheDocument()

    const submit = screen.getByRole('button', { name: /issue 3 copies/i })
    expect(submit).toBeEnabled()
    await userEvent.click(submit)

    await waitFor(() => expect(issueTokens).toHaveBeenCalledTimes(1))
    expect(issueTokens).toHaveBeenCalledWith(
      expect.objectContaining({
        contractAddress: '0xcoll',
        chainId: 80002,
        itemId: '3',
        entries: [
          { address: A, amount: 2 },
          { address: B, amount: 1 }
        ]
      })
    )
    // Success screen.
    await screen.findByRole('button', { name: /done/i })
  })

  it('should keep submit disabled when the total exceeds the available supply', async () => {
    renderModal('injected')
    const addresses = screen.getAllByLabelText(/user id/i)
    const amounts = screen.getAllByLabelText(/amount/i)
    await userEvent.type(addresses[0], A)
    await userEvent.clear(amounts[0])
    await userEvent.type(amounts[0], '6') // available is 5

    expect(screen.getByRole('button', { name: /issue 6 copies/i })).toBeDisabled()
    // Over-cap note surfaces.
    expect(screen.getByText(/at most 5 more copies/i)).toBeInTheDocument()
  })

  it('should show the "Issuing…" busy label for a managed (web2) wallet', async () => {
    let resolve: (v: unknown) => void = () => {}
    issueTokens.mockReturnValue(new Promise(res => (resolve = res)))
    renderModal('magic')

    await userEvent.type(screen.getAllByLabelText(/user id/i)[0], A)
    await userEvent.click(screen.getByRole('button', { name: /issue 1 copy/i }))

    await screen.findByRole('button', { name: /issuing…/i })
    expect(screen.queryByRole('button', { name: /^confirm$/i })).not.toBeInTheDocument()
    resolve('0xhash')
    await waitFor(() => expect(issueTokens).toHaveBeenCalledTimes(1))
  })

  it('should show the "Confirm" busy label for a self-custody wallet', async () => {
    let resolve: (v: unknown) => void = () => {}
    issueTokens.mockReturnValue(new Promise(res => (resolve = res)))
    renderModal('injected')

    await userEvent.type(screen.getAllByLabelText(/user id/i)[0], A)
    await userEvent.click(screen.getByRole('button', { name: /issue 1 copy/i }))

    await screen.findByRole('button', { name: /^confirm$/i })
    expect(screen.queryByRole('button', { name: /issuing…/i })).not.toBeInTheDocument()
    resolve('0xhash')
    await waitFor(() => expect(issueTokens).toHaveBeenCalledTimes(1))
  })
})
