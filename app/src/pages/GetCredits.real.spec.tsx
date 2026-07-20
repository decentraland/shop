import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// These specs exercise the REAL hosted-redirect wiring of GetCredits (isMockPayments() === false):
// the ?order= return handler (poll → success / pending / failed), the checkout-create redirect and
// its failure, and the "0 credits added" guard. The unit env forces the mock path globally
// (VITE_STRIPE_PK=''), so the only way to drive the real path is to mock ~/lib/payments wholesale and
// control isMockPayments/createPackCheckout/pollCreditGrant per test. (The mock-path integration
// happy paths live in GetCredits.spec.tsx, which uses the real payments module.)

const session = {
  address: '0xabc0000000000000000000000000000000000abc',
  chainId: 80002,
  signer: {} as never,
  web3Provider: {} as never,
  identity: {} as never,
  providerType: 'injected' as never,
}

const signIn = vi.fn()
let currentSession: typeof session | null = session
vi.mock('~/store/wallet', () => ({
  useWallet: () => ({ session: currentSession, connecting: false, error: null, signIn, restore: vi.fn(), disconnect: vi.fn() }),
}))

vi.mock('decentraland-ui2', () => ({
  CircularProgress: ({ size }: { size?: number }) => <span role="progressbar" data-size={size} />,
}))

// Real mode + controllable payment seam. isMockPayments returns false so CREDITS_PROVIDER = 'stripe'
// and the pack click takes the hosted-redirect branch.
const { isMockPayments, createPackCheckout, pollCreditGrant, CREDIT_PACKS } = vi.hoisted(() => ({
  isMockPayments: vi.fn(() => false),
  createPackCheckout: vi.fn(),
  pollCreditGrant: vi.fn(),
  CREDIT_PACKS: [
    { id: 'pack_5', usd: 5, credits: 50 },
    { id: 'pack_10', usd: 10, credits: 100 },
    { id: 'pack_25', usd: 25, credits: 250, bestValue: true },
    { id: 'pack_50', usd: 50, credits: 500 },
  ],
}))
vi.mock('~/lib/payments', () => ({ isMockPayments, createPackCheckout, pollCreditGrant, CREDIT_PACKS }))

const { track, errorCode } = vi.hoisted(() => ({ track: vi.fn(), errorCode: vi.fn(() => 'ERR_CODE') }))
vi.mock('~/lib/analytics', () => ({ track, errorCode }))

const { captureError } = vi.hoisted(() => ({ captureError: vi.fn() }))
vi.mock('~/lib/monitoring', () => ({ captureError }))

// eslint-disable-next-line import/first
import { GetCredits } from '~/pages/GetCredits'

// Surfaces the current router search string so idempotency tests can assert `?order=` was stripped.
function LocationProbe() {
  const { search } = useLocation()
  return <div data-testid="search">{search}</div>
}

function renderPage(initialEntry = '/') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidate = vi.spyOn(qc, 'invalidateQueries')
  const utils = render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <GetCredits />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>
  )
  return { ...utils, qc, invalidate }
}

// Stub window.location so the hosted-redirect assignment (window.location.href = url) is observable and
// doesn't trigger jsdom's "Not implemented: navigation". MemoryRouter never touches window.location.
const realLocation = window.location
beforeEach(() => {
  vi.clearAllMocks()
  isMockPayments.mockReturnValue(false)
  currentSession = session
  Object.defineProperty(window, 'location', { configurable: true, writable: true, value: { href: '' } })
})
afterAll(() => {
  Object.defineProperty(window, 'location', { configurable: true, writable: true, value: realLocation })
})

describe('when returning from Stripe hosted Checkout on the real path', () => {
  it('should poll ?order=, show the crediting → success screen with the granted count, and refetch the balance', async () => {
    pollCreditGrant.mockResolvedValue({ status: 'credited', creditsGranted: 250, newBalance: 750 })

    const { invalidate } = renderPage('/?order=ord_x')

    // The grant resolves to the success screen with the server-reported count (the crediting spinner is
    // exercised by GetCredits.spec.tsx, whose real mock lingers; here the poll resolves instantly).
    expect(await screen.findByText(/purchase was successful/i)).toBeInTheDocument()
    expect(screen.getByText(/250/)).toBeInTheDocument()
    expect(screen.getByText(/added to your account/i)).toBeInTheDocument()

    // The order id polled came from the return param, and the balance query was invalidated.
    expect(pollCreditGrant).toHaveBeenCalledWith('ord_x', expect.objectContaining({ address: session.address }))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['usd-balance'] })
  })

  it('should show a generic success (not "0 credits added") when the server omits creditsGranted on a credited order', async () => {
    // Bug 1: on the real return `selected` is null, so a missing creditsGranted used to render "0
    // credits added" (and log credits:0) to a buyer who WAS charged.
    pollCreditGrant.mockResolvedValue({ status: 'credited', newBalance: 750 })

    renderPage('/?order=ord_x')

    expect(await screen.findByText(/purchase was successful/i)).toBeInTheDocument()
    expect(screen.getByText(/your credits are ready/i)).toBeInTheDocument()
    // No misleading "0" count anywhere on the success screen.
    expect(screen.queryByText('0')).not.toBeInTheDocument()
    expect(screen.queryByText(/added to your account/i)).not.toBeInTheDocument()

    // …and analytics must not claim a real grant of 0 credits.
    const completed = track.mock.calls.find(c => c[0] === 'Shop Completed Buy Credits')
    expect(completed).toBeTruthy()
    expect(completed?.[1]).toMatchObject({ credits: null })
  })

  it('should treat creditsGranted: 0 the same as missing (generic success, no "0 credits")', async () => {
    pollCreditGrant.mockResolvedValue({ status: 'credited', creditsGranted: 0, newBalance: 750 })

    renderPage('/?order=ord_x')

    expect(await screen.findByText(/purchase was successful/i)).toBeInTheDocument()
    expect(screen.getByText(/your credits are ready/i)).toBeInTheDocument()
    const completed = track.mock.calls.find(c => c[0] === 'Shop Completed Buy Credits')
    expect(completed?.[1]).toMatchObject({ credits: null })
  })

  it('should show the "on the way" pending state (not an error) when the poll returns pending', async () => {
    pollCreditGrant.mockResolvedValue({ status: 'pending' })

    const { invalidate } = renderPage('/?order=ord_x')

    expect(await screen.findByText(/on the way/i)).toBeInTheDocument()
    expect(screen.getByText(/no need to pay again/i)).toBeInTheDocument()
    expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument()
    // Balance still refetched (the webhook can land the credits later) and a pending event fired.
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['usd-balance'] })
    expect(track.mock.calls.some(c => c[0] === 'Shop Buy Credits Pending')).toBe(true)
  })

  it('should show the error state with a Try-again reset when the poll returns failed', async () => {
    const user = userEvent.setup()
    pollCreditGrant.mockResolvedValue({ status: 'failed', error: 'Your card was declined.' })

    renderPage('/?order=ord_x')

    expect(await screen.findByText(/something went wrong/i)).toBeInTheDocument()
    expect(screen.getByText(/your card was declined/i)).toBeInTheDocument()
    expect(track.mock.calls.some(c => c[0] === 'Shop Buy Credits Failed' && c[1]?.step === 'grant')).toBe(true)

    // Try again returns to the pack grid.
    await user.click(screen.getByRole('button', { name: /try again/i }))
    expect(screen.getByRole('button', { name: /250 credits for \$25/i })).toBeInTheDocument()
  })

  it('should only poll once even though clearing the return params re-runs the effect (no double-poll)', async () => {
    pollCreditGrant.mockResolvedValue({ status: 'credited', creditsGranted: 250, newBalance: 750 })

    renderPage('/?order=ord_x')

    expect(await screen.findByText(/purchase was successful/i)).toBeInTheDocument()
    // The return handler clears ?order= (changing searchParams → effect re-runs), but the returnHandled
    // ref must keep it to a single poll.
    expect(pollCreditGrant).toHaveBeenCalledTimes(1)
  })

  it('should strip ?order= after handling so a refresh does not re-poll', async () => {
    pollCreditGrant.mockResolvedValue({ status: 'credited', creditsGranted: 250, newBalance: 750 })

    renderPage('/?order=ord_x')

    expect(await screen.findByText(/purchase was successful/i)).toBeInTheDocument()
    expect(screen.getByTestId('search').textContent).not.toContain('order')
  })

  it('should map an AbortError from the poll to the "cancelled" friendly message', async () => {
    pollCreditGrant.mockRejectedValue(new DOMException('Aborted', 'AbortError'))

    renderPage('/?order=ord_x')

    expect(await screen.findByText(/something went wrong/i)).toBeInTheDocument()
    expect(screen.getByText(/you cancelled the request/i)).toBeInTheDocument()
    expect(captureError).toHaveBeenCalled()
  })

  it('should map a "sign in" poll error to the sign-in friendly message', async () => {
    pollCreditGrant.mockRejectedValue(new Error('Sign in to get credits.'))

    renderPage('/?order=ord_x')

    expect(await screen.findByText(/something went wrong/i)).toBeInTheDocument()
    expect(screen.getByText(/sign in to get credits/i)).toBeInTheDocument()
  })

  it('should not poll until the wallet identity is restored (signed-fetch needs it)', async () => {
    // On the success_url the poll is a signed-fetch; until the wallet restores (session null) we must
    // NOT poll. With always-show-packs there's no sign-in gate — the buyer (who WAS charged) sees the
    // "completing purchase" crediting state while the wallet silently restores, then the poll runs.
    currentSession = null
    pollCreditGrant.mockResolvedValue({ status: 'credited', creditsGranted: 250 })

    renderPage('/?order=ord_x')

    expect(await screen.findByText(/completing purchase/i)).toBeInTheDocument()
    expect(pollCreditGrant).not.toHaveBeenCalled()
  })
})

describe('when starting a real hosted checkout from a pack click', () => {
  it('should redirect the browser to the Stripe hosted URL and fire the redirect funnel event', async () => {
    const user = userEvent.setup()
    createPackCheckout.mockResolvedValue({
      orderId: 'ord_new',
      url: 'https://checkout.stripe.com/c/pay/cs_test_123',
      mock: false,
    })

    renderPage('/')

    await user.click(screen.getByRole('button', { name: /250 credits for \$25/i }))

    // No intermediate embedded card form / "choose a different pack" back-link — the pack click goes
    // straight to Stripe (a minimal "redirecting to secure checkout" spinner covers the async window).
    expect(await screen.findByText(/redirecting to secure checkout/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /pay \$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /choose a different pack/i })).not.toBeInTheDocument()

    // Redirect happens once the hosted session resolves; the funnel marker fires with the order id.
    await vi.waitFor(() => expect(window.location.href).toBe('https://checkout.stripe.com/c/pay/cs_test_123'))
    const redirected = track.mock.calls.find(c => c[0] === 'Shop Redirected To Stripe')
    expect(redirected?.[1]).toMatchObject({ order_id: 'ord_new', pack_usd: 25 })
    // A card-click never enters an error state on the happy redirect.
    expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument()
  })

  it('should show the error phase and fire the checkout-failed event when creating the hosted session rejects', async () => {
    const user = userEvent.setup()
    createPackCheckout.mockRejectedValue(new Error('network down'))

    renderPage('/')

    await user.click(screen.getByRole('button', { name: /100 credits for \$10/i }))

    expect(await screen.findByText(/something went wrong/i)).toBeInTheDocument()
    const failed = track.mock.calls.find(c => c[0] === 'Shop Buy Credits Failed')
    expect(failed?.[1]).toMatchObject({ step: 'checkout', pack_usd: 10 })
    expect(captureError).toHaveBeenCalled()
  })

  it('should show the "payment canceled" note (not an error) when returning with ?canceled=1', async () => {
    renderPage('/?canceled=1')

    expect(await screen.findByText(/payment canceled/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /250 credits for \$25/i })).toBeInTheDocument()
    expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument()
    expect(track.mock.calls.some(c => c[0] === 'Shop Buy Credits Cancelled')).toBe(true)
  })
})
