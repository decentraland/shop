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
const fetchContractRegistry = vi.fn()
vi.mock('~/lib/api', () => ({
  fetchMyAssets: (...args: unknown[]) => fetchMyAssets(...args),
  fetchContractRegistry: (...args: unknown[]) => fetchContractRegistry(...args)
}))

const getAuthorizationStatus = vi.fn()
/**
 * The superseded-version rows. Empty by default so the existing tests see exactly one row per permission,
 * which is what a chain with a single deployed marketplace renders.
 */
const getLegacyMarketplaceAuthorizations = vi.fn<() => unknown[]>(() => [])
const setAuthorization = vi.fn()
vi.mock('~/lib/authorizations', () => ({
  AuthorizationKind: { Allowance: 'allowance', Approval: 'approval', Minter: 'minter' },
  getLegacyMarketplaceAuthorizations: () => getLegacyMarketplaceAuthorizations(),
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
  // The MANA-only rail's allowance: same token, a DIFFERENT spender (the marketplace, not the
  // CreditsManager) — so it is its own row and its own on-chain approval.
  getManaMarketplaceAuthorization: (chainId: number) => ({
    id: 'mana-marketplace',
    group: 'buying',
    kind: 'allowance',
    contractAddress: '0xmana',
    spenderAddress: '0xmarketplace',
    chainId
  }),
  getCollectionSellingAuthorization: (contractAddress: string, chainId: number) => ({
    id: `selling:${contractAddress.toLowerCase()}`,
    group: 'selling',
    kind: 'approval',
    contractAddress,
    spenderAddress: '0xmarket',
    chainId
  }),
  getCollectionMintingAuthorization: (contractAddress: string, chainId: number) => ({
    id: `minting:${contractAddress.toLowerCase()}`,
    group: 'minting',
    kind: 'minter',
    contractAddress,
    spenderAddress: '0xmarket',
    chainId
  })
}))

const fetchCreatorCollections = vi.fn()
vi.mock('~/lib/builder', () => ({
  fetchCreatorCollections: (...args: unknown[]) => fetchCreatorCollections(...args)
}))

import { Authorizations } from '~/pages/Authorizations'

// Real 20-byte addresses: the fallback label shortens them, so a placeholder like '0xCOLL' would take
// a different branch than production ever does.
const COLL_A = '0xaaaa000000000000000000000000000000000001'
const COLL_B = '0xbbbb000000000000000000000000000000000002'
const COLL_C = '0xcccc000000000000000000000000000000000003'

function ownedAsset(contractAddress: string, name: string) {
  return { contractAddress, name, image: '', chainId: 80002 }
}

// Serve the holdings endpoint by (category, skip) rather than by call order: the two categories are
// requested concurrently, so `mockResolvedValueOnce` chains cannot express which page is which.
function mockOwnedPages({ total, byPage }: { total: number; byPage: string[] }) {
  fetchMyAssets.mockImplementation(
    (_owner: string, { category, skip = 0 }: { category: string; first: number; skip?: number }) => {
      if (category !== 'wearable') return Promise.resolve({ assets: [], total: 0 })
      // Pages past the listed collections hold another copy from the first one — what a wallet big
      // enough to page really looks like, and it keeps the scanned count equal to the pages read.
      const contractAddress = byPage[skip / 500] ?? byPage[0]
      return Promise.resolve({ assets: [ownedAsset(contractAddress, 'An item')], total })
    }
  )
}

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
  fetchContractRegistry.mockResolvedValue(new Map<string, string>())
  fetchCreatorCollections.mockResolvedValue([])
  getAuthorizationStatus.mockResolvedValue(false)
  getLegacyMarketplaceAuthorizations.mockReturnValue([])
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
    fetchMyAssets.mockResolvedValueOnce({ assets: [ownedAsset(COLL_A, 'Cool Hat')], total: 1 })
    fetchMyAssets.mockResolvedValueOnce({ assets: [], total: 0 })
    renderPage()
    expect(await screen.findByTestId(`authorization-toggle-selling:${COLL_A}`)).toBeInTheDocument()
  })

  it('should title a selling row after the collection, not after an item the owner holds in it', async () => {
    fetchMyAssets.mockResolvedValueOnce({ assets: [ownedAsset(COLL_A, 'Banana Crown')], total: 1 })
    fetchMyAssets.mockResolvedValueOnce({ assets: [], total: 0 })
    fetchContractRegistry.mockResolvedValueOnce(new Map([[COLL_A, 'Summer Capsule']]))
    renderPage()
    expect(await screen.findByText('Summer Capsule')).toBeInTheDocument()
    expect(screen.queryByText('Banana Crown')).not.toBeInTheDocument()
  })

  it('should match the registry regardless of the address casing the holdings report', async () => {
    fetchMyAssets.mockResolvedValueOnce({ assets: [ownedAsset(COLL_A.toUpperCase(), 'Regal Blue Suit')], total: 1 })
    fetchMyAssets.mockResolvedValueOnce({ assets: [], total: 0 })
    fetchContractRegistry.mockResolvedValueOnce(new Map([[COLL_A, 'Summer Capsule']]))
    renderPage()
    expect(await screen.findByText('Summer Capsule')).toBeInTheDocument()
  })

  it('should fall back to a shortened address when the collection is not in the registry', async () => {
    fetchMyAssets.mockResolvedValueOnce({ assets: [ownedAsset(COLL_A, 'Banana Crown')], total: 1 })
    fetchMyAssets.mockResolvedValueOnce({ assets: [], total: 0 })
    fetchContractRegistry.mockResolvedValueOnce(new Map<string, string>())
    renderPage()
    // Unique and stable, unlike the item name and unlike the generic label shared by every row.
    expect(await screen.findByText('0xaaaa…0001')).toBeInTheDocument()
    expect(screen.queryByText('Banana Crown')).not.toBeInTheDocument()
    expect(screen.queryByText('Your collection')).not.toBeInTheDocument()
  })

  it('should still list the collections when the registry cannot be loaded', async () => {
    fetchMyAssets.mockResolvedValueOnce({ assets: [ownedAsset(COLL_A, 'Banana Crown')], total: 1 })
    fetchMyAssets.mockResolvedValueOnce({ assets: [], total: 0 })
    fetchContractRegistry.mockRejectedValueOnce(new Error('registry down'))
    renderPage()
    expect(await screen.findByTestId(`authorization-toggle-selling:${COLL_A}`)).toBeInTheDocument()
    expect(screen.getByText('0xaaaa…0001')).toBeInTheDocument()
  })

  it('should list every collection when the owner holds more than one page of assets', async () => {
    // Only the FIRST collection is on page 1 — a page-1-only read would hide B and C, and with them
    // the toggles their owner needs to be able to sell at all.
    mockOwnedPages({ total: 1200, byPage: [COLL_A, COLL_B, COLL_C] })
    fetchContractRegistry.mockResolvedValueOnce(
      new Map([
        [COLL_A, 'Collection A'],
        [COLL_B, 'Collection B'],
        [COLL_C, 'Collection C']
      ])
    )
    renderPage()

    expect(await screen.findByTestId(`authorization-toggle-selling:${COLL_C}`)).toBeInTheDocument()
    expect(screen.getByTestId(`authorization-toggle-selling:${COLL_A}`)).toBeInTheDocument()
    expect(screen.getByTestId(`authorization-toggle-selling:${COLL_B}`)).toBeInTheDocument()
    expect(screen.queryByTestId('authorizations-selling-truncated')).not.toBeInTheDocument()
  })

  it('should say so when the owner holds more assets than the page will read', async () => {
    // 5001 wearables is one past the ceiling (500 × 10), so something IS missing — never silently.
    mockOwnedPages({ total: 5001, byPage: [COLL_A, COLL_B, COLL_C] })
    renderPage()

    // The notice reports what was actually read (10 pages × 1 asset), not the nominal ceiling.
    expect(await screen.findByTestId('authorizations-selling-truncated')).toHaveTextContent('10 most recent')
    expect(fetchMyAssets).toHaveBeenCalledTimes(11) // 10 wearable pages + 1 emote page
  })

  it('should list one minting approval per publishable collection', async () => {
    fetchCreatorCollections.mockResolvedValueOnce([
      { id: 'c1', name: '3Dium x TOTF', contractAddress: '0xMINT', isPublished: true, isApproved: true, minters: [] }
    ])
    renderPage()
    expect(await screen.findByTestId('authorization-toggle-minting:0xmint')).toBeInTheDocument()
    expect(screen.getByText('3Dium x TOTF')).toBeInTheDocument()
  })

  it('should show the minting empty hint when there are no publishable collections', async () => {
    fetchCreatorCollections.mockResolvedValueOnce([])
    renderPage()
    expect(await screen.findByText(/Approvals for minting appear here/)).toBeInTheDocument()
  })
})

/**
 * Superseded marketplace versions. Grants only ever target the newest, so a row for an older one exists
 * for exactly one reason: something granted before the newer version shipped is still live on chain and
 * has to be revocable. A row for a version nobody holds is noise, which is what `revokeOnly` decides.
 */
describe('when a superseded marketplace version is still deployed on the chain', () => {
  const LEGACY_ID = 'mana-marketplace@0xlegacymarketplace'

  beforeEach(() => {
    getLegacyMarketplaceAuthorizations.mockReturnValue([
      {
        id: LEGACY_ID,
        group: 'buying',
        kind: 'allowance',
        contractAddress: '0xmana',
        spenderAddress: '0xlegacymarketplace',
        chainId: 80002
      }
    ])
  })

  describe('and the wallet still holds a grant on it', () => {
    beforeEach(() => {
      getAuthorizationStatus.mockResolvedValue(true)
    })

    it('should render a row for it, so the grant can be taken back', async () => {
      renderPage()

      expect(await screen.findByTestId(`authorization-toggle-${LEGACY_ID}`)).toBeInTheDocument()
    })
  })

  describe('and the status read fails', () => {
    beforeEach(() => {
      getAuthorizationStatus.mockRejectedValue(new Error('rpc down'))
    })

    // The row is the only way to revoke. Hiding it because the read failed would take it away from the one
    // user who actually holds the grant, at exactly the moment the chain is hard to reach.
    it('should keep the row rather than hide a grant it could not read', async () => {
      renderPage()

      expect(await screen.findByTestId(`authorization-toggle-${LEGACY_ID}`)).toBeInTheDocument()
    })
  })

  describe('and the wallet holds no grant on it', () => {
    beforeEach(() => {
      getAuthorizationStatus.mockResolvedValue(false)
    })

    // waitFor, not a bare assertion: the row is only hidden once the status read RESOLVES false. While it is
    // in flight `active` is undefined and the row stays — deliberately, so an RPC error cannot silently drop
    // the row of the one user who actually holds the grant.
    it('should render no row for it once the status resolves', async () => {
      renderPage()
      await screen.findByTestId('authorization-toggle-credits')

      await waitFor(() => expect(screen.queryByTestId(`authorization-toggle-${LEGACY_ID}`)).not.toBeInTheDocument())
    })

    it('should still render the current version row', async () => {
      renderPage()

      expect(await screen.findByTestId('authorization-toggle-mana-marketplace')).toBeInTheDocument()
    })
  })
})
