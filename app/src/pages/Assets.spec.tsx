import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// Assets pulls a lot of heavy ESM transitively (checkout + names libs → decentraland-transactions
// cross-chain), which doesn't resolve under vitest — mock those seams. We only care that selecting
// the NAMEs category swaps the grid for the NAMEs page.
vi.mock('~/lib/api', () => ({ fetchShopItems: vi.fn().mockResolvedValue({ items: [], total: 0 }), fetchTrade: vi.fn() }))
vi.mock('~/lib/collections', () => ({ fetchCatalogItems: vi.fn().mockResolvedValue({ items: [], total: 0 }) }))
vi.mock('~/lib/mana-rate', () => ({ manaWeiToCredits: () => 10, manaWeiToUsdCents: () => 100 }))
vi.mock('~/hooks/useManaRate', () => ({ useManaRate: () => ({ data: undefined, isError: false }) }))
vi.mock('~/lib/buy', () => ({ buyWithCredits: vi.fn() }))
vi.mock('~/lib/gasless-config', () => ({ gaslessEnabled: () => false }))
vi.mock('~/lib/buy-gasless', () => ({
  buyGasless: vi.fn(),
  waitForSettlement: vi.fn(),
  GaslessUnavailableError: class extends Error {},
  SettlementPendingError: class extends Error {}
}))
vi.mock('~/lib/analytics', () => ({ track: vi.fn(), errorCode: () => 'x', isUserRejection: () => false }))

// The names lib (heavy) — stand-ins are enough for the NAMEs page to mount.
vi.mock('~/lib/names', () => ({
  NAME_MIN_LENGTH: 2,
  NAME_MAX_LENGTH: 15,
  NAME_PRICE_IN_WEI: '100000000000000000000',
  validateName: (raw: string) => (raw.trim().length >= 2 ? { ok: true } : { ok: false, reason: 'too-short' }),
  sanitizeNameInput: (raw: string) => raw.replace(/[^a-zA-Z0-9]/g, '').slice(0, 15),
  checkNameAvailability: vi.fn().mockResolvedValue('available'),
  registerNameWithUsdCredits: vi.fn()
}))

const state = {
  session: {
    address: '0xabc0000000000000000000000000000000000abc',
    identity: {},
    signer: {},
    providerType: 'injected'
  },
  signIn: vi.fn(),
  connecting: false,
  error: null,
  restore: vi.fn(),
  disconnect: vi.fn()
}
vi.mock('~/store/wallet', () => ({
  useWallet: (sel?: (s: unknown) => unknown) => (typeof sel === 'function' ? sel(state) : state)
}))

import { Assets } from '~/pages/Assets'

function renderAssets() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/assets']}>
        <Assets />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

beforeEach(() => vi.clearAllMocks())

describe('Assets — NAMEs category', () => {
  it('should render the collectibles grid by default (not the NAMEs page)', () => {
    renderAssets()
    expect(screen.getByTestId('browse')).toBeInTheDocument()
    expect(screen.queryByTestId('names-page')).not.toBeInTheDocument()
  })

  it('should render the NAMEs page when the NAMEs category is selected', async () => {
    renderAssets()
    await userEvent.click(screen.getByRole('button', { name: 'NAMEs' }))
    expect(await screen.findByTestId('names-page')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Get your unique NAME!' })).toBeInTheDocument()
  })
})
