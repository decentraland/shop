import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

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

let walletState = {
  session: makeSession('injected'),
  connecting: false,
  error: null as string | null,
  signIn: vi.fn(),
  restore: vi.fn(),
  disconnect: vi.fn()
}
vi.mock('~/store/wallet', () => ({
  useWallet: (sel?: (s: typeof walletState) => unknown) => (sel ? sel(walletState) : walletState)
}))

vi.mock('~/config', () => ({ config: { chainId: 80002 } }))
vi.mock('~/lib/monitoring', () => ({ captureError: vi.fn() }))

const fetchMyAssets = vi.fn()
vi.mock('~/lib/api', () => ({ fetchMyAssets: (...args: unknown[]) => fetchMyAssets(...args) }))

const getAuthorizationStatus = vi.fn()
const setAuthorization = vi.fn()
vi.mock('~/lib/authorizations', () => ({
  AuthorizationKind: { Allowance: 'allowance', Approval: 'approval', Minter: 'minter' },
  getAuthorizationStatus: (...args: unknown[]) => getAuthorizationStatus(...args),
  setAuthorization: (...args: unknown[]) => setAuthorization(...args),
  getCreditsAuthorization: (chainId: number) => ({
    id: 'credits',
    group: 'buying',
    kind: 'allowance',
    contractAddress: '0xmana',
    spenderAddress: '0xcredits',
    chainId
  }),
  getCollectionSellingAuthorization: (contractAddress: string, chainId: number) => ({
    id: `selling:${contractAddress.toLowerCase()}`,
    group: 'selling',
    kind: 'approval',
    contractAddress,
    spenderAddress: '0xmarket',
    chainId
  })
}))

import { Authorizations } from '~/pages/Authorizations'

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Authorizations />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  walletState = {
    session: makeSession('injected'),
    connecting: false,
    error: null,
    signIn: vi.fn(),
    restore: vi.fn(),
    disconnect: vi.fn()
  }
  fetchMyAssets.mockResolvedValue({ assets: [], total: 0 })
  getAuthorizationStatus.mockResolvedValue(false)
  setAuthorization.mockResolvedValue(undefined)
})

describe('when the visitor is not signed in', () => {
  it('should prompt them to sign in', () => {
    walletState.session = null as never
    renderPage()
    expect(screen.getByText('Sign in to manage approvals')).toBeInTheDocument()
  })
})

describe('when the visitor uses a managed (web2) wallet', () => {
  it('should show a reassuring state with no approval toggles', async () => {
    walletState.session = makeSession('magic')
    renderPage()
    expect(await screen.findByText('You’re all set')).toBeInTheDocument()
    expect(screen.queryByTestId('authorization-toggle-credits')).not.toBeInTheDocument()
    expect(fetchMyAssets).not.toHaveBeenCalled()
  })
})

describe('when the visitor uses a self-custody (web3) wallet', () => {
  it('should render the credits approval with its live status', async () => {
    getAuthorizationStatus.mockResolvedValue(true)
    renderPage()
    const toggle = await screen.findByTestId('authorization-toggle-credits')
    await waitFor(() => expect(toggle).toHaveAttribute('data-active', 'true'))
  })

  it('should grant the approval when the toggle is turned on', async () => {
    getAuthorizationStatus.mockResolvedValue(false)
    renderPage()
    const toggle = await screen.findByTestId('authorization-toggle-credits')
    await waitFor(() => expect(toggle).toHaveAttribute('data-active', 'false'))

    await userEvent.click(toggle)

    await waitFor(() => expect(setAuthorization).toHaveBeenCalledTimes(1))
    expect(setAuthorization).toHaveBeenCalledWith(
      expect.objectContaining({
        auth: expect.objectContaining({ id: 'credits' }),
        signer: walletState.session.signer,
        active: true
      })
    )
  })

  it('should list one selling approval per owned collection', async () => {
    fetchMyAssets.mockResolvedValueOnce({
      assets: [{ contractAddress: '0xCOLL', name: 'Cool Hat', image: '', chainId: 80002 }],
      total: 1
    })
    fetchMyAssets.mockResolvedValueOnce({ assets: [], total: 0 })
    renderPage()
    expect(await screen.findByTestId('authorization-toggle-selling:0xcoll')).toBeInTheDocument()
  })
})
