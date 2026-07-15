import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
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

const signIn = vi.fn()
// Mutable so a test can render the logged-out state (session = null).
let currentSession: typeof session | null = session
vi.mock('~/store/wallet', () => ({
  useWallet: () => ({ session: currentSession, connecting: false, error: null, signIn, restore: vi.fn(), disconnect: vi.fn() })
}))

// decentraland-ui2 pulls heavy ESM transitive deps (@dcl/hooks) that don't resolve under
// vitest/jsdom — stub the one component we use (same reason trades.spec mocks
// decentraland-transactions). This keeps the test on the real component tree otherwise.
vi.mock('decentraland-ui2', () => ({
  CircularProgress: ({ size }: { size?: number }) => <span role="progressbar" data-size={size} />
}))

// In mock mode the pack "purchase" tops up the real backend via devMintUsd — stub it so the test
// stays offline (no credits-server). The success screen shows the pack's granted credits regardless.
vi.mock('~/lib/credits', () => ({
  devMintUsd: vi.fn().mockResolvedValue({ id: 'test', usdCents: 2500, balanceCents: 2500, credits: 250 })
}))

// eslint-disable-next-line import/first
import { GetCredits } from '~/pages/GetCredits'

function renderPage(initialEntry = '/') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <GetCredits />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('when a signed-in user opens the get-credits page', () => {
  beforeEach(() => vi.clearAllMocks())

  it('should show every credit pack with its price, credits and one best-value pack', () => {
    renderPage()
    expect(screen.getByRole('button', { name: /50 credits for \$5/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /100 credits for \$10/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /250 credits for \$25/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /500 credits for \$50/i })).toBeInTheDocument()
    expect(screen.getByText(/best value/i)).toBeInTheDocument()
  })

  it('should buy a pack end-to-end and add the credits (mocked happy path)', async () => {
    const user = userEvent.setup()
    renderPage()

    // Pick a pack.
    await user.click(screen.getByRole('button', { name: /250 credits for \$25/i }))

    // The mock card form appears with the summary; pay.
    const payButton = await screen.findByRole('button', { name: /pay \$25/i })
    await user.click(payButton)

    // Processing → success: credits added. (Mock flow has a short simulated
    // charge + crediting delay, so allow more than the RTL default timeout.)
    expect(await screen.findByText(/you.?re all set/i, {}, { timeout: 4000 })).toBeInTheDocument()
    expect(screen.getByText(/250/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /back to cart/i })).toBeInTheDocument()
  })

  it('should let the user go back and choose a different pack before paying', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: /50 credits for \$5/i }))
    await user.click(await screen.findByRole('button', { name: /choose a different pack/i }))

    // Back on the pack grid.
    expect(screen.getByRole('button', { name: /500 credits for \$50/i })).toBeInTheDocument()
  })
})

describe('when returning from Stripe hosted Checkout', () => {
  beforeEach(() => vi.clearAllMocks())

  it('should poll the order from ?order= and show the crediting → success flow', async () => {
    // Mock mode (no stripe key in test config): pollCreditGrant takes the offline mock path for
    // the returned order id, so this exercises the return-handling wiring without a backend.
    renderPage('/?order=ord_test_123')

    // Lands straight in the crediting state (no pack grid flash)…
    expect(await screen.findByText(/adding your credits/i)).toBeInTheDocument()
    // …then the mock grant resolves to the success screen.
    expect(await screen.findByText(/you.?re all set/i, {}, { timeout: 4000 })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /back to cart/i })).toBeInTheDocument()
  })

  it('should show a gentle canceled note (not an error) and keep the packs on ?canceled=1', async () => {
    renderPage('/?canceled=1')

    expect(await screen.findByText(/payment canceled/i)).toBeInTheDocument()
    // Not an error state — the packs are still selectable.
    expect(screen.getByRole('button', { name: /250 credits for \$25/i })).toBeInTheDocument()
    expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument()
  })
})

describe('when a signed-out user opens the get-credits page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    currentSession = null
  })
  afterEach(() => {
    currentSession = session
  })

  it('should prompt to sign in instead of showing the packs, and sign in on click', async () => {
    const user = userEvent.setup()
    renderPage()

    // No purchasable packs while logged out.
    expect(screen.queryByRole('button', { name: /50 credits for \$5/i })).not.toBeInTheDocument()

    // A sign-in CTA is shown and triggers the login redirect.
    const signInBtn = screen.getByRole('button', { name: /^sign in$/i })
    await user.click(signInBtn)
    expect(signIn).toHaveBeenCalledTimes(1)
  })
})
