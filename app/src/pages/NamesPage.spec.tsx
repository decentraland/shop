import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// The real names lib pulls decentraland-transactions' cross-chain ESM (via buy-gasless/mana-rate),
// which doesn't resolve under vitest — so we mock it with faithful stand-ins for the pure helpers
// (validateName/sanitizeNameInput are unit-tested for real in names.spec.ts) plus a controllable
// availability probe.
const checkNameAvailability = vi.fn()
vi.mock('~/lib/names', () => ({
  NAME_MIN_LENGTH: 2,
  NAME_MAX_LENGTH: 15,
  NAME_PRICE_IN_WEI: '100000000000000000000',
  validateName: (raw: string) => {
    const n = raw.trim()
    if (n.length === 0) return { ok: false, reason: 'empty' }
    if (!/^[a-zA-Z0-9]+$/.test(n)) return { ok: false, reason: 'invalid-chars' }
    if (n.length < 2) return { ok: false, reason: 'too-short' }
    if (n.length > 15) return { ok: false, reason: 'too-long' }
    return { ok: true }
  },
  sanitizeNameInput: (raw: string) => raw.replace(/[^a-zA-Z0-9]/g, '').slice(0, 15),
  checkNameAvailability: (...args: unknown[]) => checkNameAvailability(...args),
  registerNameWithUsdCredits: vi.fn()
}))

// mana-rate (heavy ESM) → just a stub credit price.
vi.mock('~/lib/mana-rate', () => ({ manaWeiToCredits: () => 10 }))
vi.mock('~/hooks/useManaRate', () => ({ useManaRate: () => ({ data: { rate: 40000000n, decimals: 8 } }) }))
vi.mock('~/lib/analytics', () => ({ track: vi.fn(), errorCode: () => 'x', isUserRejection: () => false }))

const signIn = vi.fn()
let session: unknown = {
  address: '0xabc0000000000000000000000000000000000abc',
  identity: {},
  signer: {},
  providerType: 'injected'
}
vi.mock('~/store/wallet', () => ({
  useWallet: (sel?: (s: unknown) => unknown) => {
    const state = { session, signIn }
    return typeof sel === 'function' ? sel(state) : state
  }
}))

import { NamesPage } from '~/pages/NamesPage'

function renderPage(onBack = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <NamesPage onBack={onBack} />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  session = {
    address: '0xabc0000000000000000000000000000000000abc',
    identity: {},
    signer: {},
    providerType: 'injected'
  }
})

describe('NamesPage', () => {
  it('should render the idle hero with a disabled claim button', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: 'Get your unique NAME!' })).toBeInTheDocument()
    expect(screen.getByTestId('names-claim')).toBeDisabled()
    expect(checkNameAvailability).not.toHaveBeenCalled()
  })

  it('should show the "why buy a NAME?" info section', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: 'Why buy a NAME?' })).toBeInTheDocument()
    expect(screen.getByText('Stand out with a unique alias for your Avatar')).toBeInTheDocument()
  })

  it('should hint the minimum length while the name is too short', async () => {
    renderPage()
    await userEvent.type(screen.getByLabelText('Search for a NAME'), 'a')
    expect(await screen.findByText(/at least 2 characters/i)).toBeInTheDocument()
    expect(screen.getByTestId('names-claim')).toBeDisabled()
    expect(checkNameAvailability).not.toHaveBeenCalled()
  })

  it('should enable claim when the name is available', async () => {
    checkNameAvailability.mockResolvedValue('available')
    renderPage()
    await userEvent.type(screen.getByLabelText('Search for a NAME'), 'AvailableOne')
    // Debounced probe resolves → button enabled.
    await waitFor(() => expect(screen.getByTestId('names-claim')).toBeEnabled())
    expect(checkNameAvailability).toHaveBeenCalledWith('AvailableOne', expect.anything())
  })

  it('should show the taken message and keep claim disabled when the name is taken', async () => {
    checkNameAvailability.mockResolvedValue('taken')
    renderPage()
    await userEvent.type(screen.getByLabelText('Search for a NAME'), 'TakenName')
    expect(await screen.findByTestId('names-taken')).toHaveTextContent(/taken/i)
    expect(screen.getByTestId('names-claim')).toBeDisabled()
  })

  it('should prompt sign-in (not open the modal) when claiming while signed out', async () => {
    session = null
    checkNameAvailability.mockResolvedValue('available')
    renderPage()
    await userEvent.type(screen.getByLabelText('Search for a NAME'), 'GoodName')
    await waitFor(() => expect(screen.getByTestId('names-claim')).toBeEnabled())
    await userEvent.click(screen.getByTestId('names-claim'))
    expect(signIn).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('should open the buy modal when claiming while signed in', async () => {
    checkNameAvailability.mockResolvedValue('available')
    renderPage()
    await userEvent.type(screen.getByLabelText('Search for a NAME'), 'GoodName')
    await waitFor(() => expect(screen.getByTestId('names-claim')).toBeEnabled())
    await userEvent.click(screen.getByTestId('names-claim'))
    expect(await screen.findByRole('dialog', { name: 'Buy NAME' })).toBeInTheDocument()
  })

  it('should call onBack from the breadcrumb', async () => {
    const onBack = vi.fn()
    renderPage(onBack)
    await userEvent.click(screen.getByRole('button', { name: 'Collectibles' }))
    expect(onBack).toHaveBeenCalledTimes(1)
  })
})
