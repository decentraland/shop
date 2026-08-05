import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
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

// The confetti lazy-loads lottie-web, which drives real timers over a canvas — irrelevant here and noisy
// in jsdom. What matters is the <Confetti/> wrapper: whether it mounts, and on which phase.
vi.mock('lottie-react', () => ({ default: () => <span data-testid="lottie" /> }))

const signIn = vi.fn()
// Mutable so a test can render the logged-out state (session = null).
let currentSession: typeof session | null = session
vi.mock('~/store/wallet', () => ({
  useWallet: () => ({
    session: currentSession,
    connecting: false,
    error: null,
    signIn,
    restore: vi.fn(),
    disconnect: vi.fn()
  })
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
  devMintUsd: vi.fn().mockResolvedValue({ id: 'test', usdCents: 2600, balanceCents: 2600, credits: 260 })
}))

import { GetCredits } from '~/pages/GetCredits'
import { CREDIT_PACKS } from '~/lib/payments'

// The pack grid is sourced from the credits-server via useCreditPacks (GET /credits/packs). In unit
// tests we seed the react-query cache with the bundled catalogue so the grid renders synchronously
// (no network) — the real fetch + skeleton loading state is exercised by the loading test below and
// the credits e2e.
function renderPage(initialEntry = '/', { seedPacks = true } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  if (seedPacks) queryClient.setQueryData(['credit-packs'], CREDIT_PACKS)
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
    expect(screen.getByRole('button', { name: /40 credits for \$5\.99/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /100 credits for \$11\.99/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /260 credits for \$29\.99/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /540 credits for \$59\.99/i })).toBeInTheDocument()
    expect(screen.getByText(/recommended/i)).toBeInTheDocument()
  })

  it('should buy a pack end-to-end and add the credits (mocked happy path)', async () => {
    const user = userEvent.setup()
    renderPage()

    // Pick a pack — no intermediate card form in mock mode; it goes straight to crediting.
    await user.click(screen.getByRole('button', { name: /260 credits for \$29\.99/i }))

    // No embedded pay form / "choose a different pack" back-link appears.
    expect(screen.queryByRole('button', { name: /pay \$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /choose a different pack/i })).not.toBeInTheDocument()

    // Processing → success: credits added. (Mock flow has a short simulated
    // charge + crediting delay, so allow more than the RTL default timeout.)
    expect(await screen.findByText(/purchase was successful/i, {}, { timeout: 4000 })).toBeInTheDocument()
    expect(screen.getByText(/260/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /start shopping/i })).toBeInTheDocument()
  })
})

/**
 * Buying credits is a purchase, so it gets the same burst an item purchase does. It must fire only once
 * the credits are actually in the balance — raining confetti over a charge that is still processing would
 * celebrate something that has not happened yet.
 */
describe('the credits-purchase confetti', () => {
  beforeEach(() => vi.clearAllMocks())

  it('should fire on the success screen', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: /260 credits for \$29\.99/i }))
    await screen.findByText(/purchase was successful/i, {}, { timeout: 4000 })

    const confetti = screen.getByTestId('confetti')
    // Decorative and non-blocking: out of the a11y tree, and it can never eat a click on the CTAs it
    // rains over (the layer is pointer-events: none).
    expect(confetti).toHaveAttribute('aria-hidden')
  })

  it('should not fire before the purchase completes', () => {
    renderPage()

    // Still on the pack picker — nothing has been bought yet.
    expect(screen.queryByTestId('confetti')).not.toBeInTheDocument()
  })

  describe('and the visitor asked for reduced motion', () => {
    // Restored explicitly: clearAllMocks resets calls but leaves a spy's implementation in place, so a
    // leaked matchMedia stub would answer `matches: true` to every later test in this file. Typed by the
    // one method used, rather than spyOn's full generic signature.
    let matchMedia: { mockRestore: () => void } | undefined
    afterEach(() => matchMedia?.mockRestore())

    it('should not play, and should not fetch the animation either', async () => {
      const user = userEvent.setup()
      // Read once at mount by Confetti, before anything is imported.
      matchMedia = vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList)
      renderPage()

      await user.click(screen.getByRole('button', { name: /260 credits for \$29\.99/i }))
      await screen.findByText(/purchase was successful/i, {}, { timeout: 4000 })

      expect(screen.queryByTestId('confetti')).not.toBeInTheDocument()
      expect(screen.queryByTestId('lottie')).not.toBeInTheDocument()
    })
  })
})

describe('when the pack catalogue is still loading', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.unstubAllGlobals())

  it('should show content-shaped pack skeletons (not the packs) until the fetch resolves', () => {
    // Never-resolving fetch → the useCreditPacks query stays in its loading state.
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {}))
    )
    // Don't seed the cache: force the real loading path.
    const { container } = renderPage('/', { seedPacks: false })

    expect(container.querySelectorAll('[data-testid="pack-skeleton"]').length).toBe(4)
    // The real (clickable) packs are not rendered yet.
    expect(screen.queryByRole('button', { name: /260 credits for \$29\.99/i })).not.toBeInTheDocument()

    // One bar per element it stands in for: amount, unit, artwork, price. The unit bar is the one that was
    // missing, and without it the skeleton card was 44px taller than the card that replaced it, so the whole
    // grid resized on hand-off. A future refactor that drops a bar brings the jump back.
    const skeleton = container.querySelector('[data-testid="pack-skeleton"]') as HTMLElement
    const bars = [...skeleton.querySelectorAll('span')].filter(el => el.children.length === 0)
    expect(bars).toHaveLength(4)
  })
})

describe('when returning from Stripe hosted Checkout', () => {
  beforeEach(() => vi.clearAllMocks())

  it('should poll the order from ?order= and show the crediting → success flow', async () => {
    // Mock mode (no stripe key in test config): pollCreditGrant takes the offline mock path for
    // the returned order id, so this exercises the return-handling wiring without a backend.
    renderPage('/?order=ord_test_123')

    // Lands straight in the crediting state (no pack grid flash)…
    expect(await screen.findByText(/completing purchase/i)).toBeInTheDocument()
    // …then the mock grant resolves to the success screen.
    expect(await screen.findByText(/purchase was successful/i, {}, { timeout: 4000 })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /start shopping/i })).toBeInTheDocument()
  })

  it('should show a gentle canceled note (not an error) and keep the packs on ?canceled=1', async () => {
    renderPage('/?canceled=1')

    expect(await screen.findByText(/payment canceled/i)).toBeInTheDocument()
    // Not an error state — the packs are still selectable.
    expect(screen.getByRole('button', { name: /260 credits for \$29\.99/i })).toBeInTheDocument()
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

  it('should still show the packs and start sign-in when a pack is clicked', async () => {
    const user = userEvent.setup()
    renderPage()

    // Packs are visible even while logged out (always-show-packs).
    expect(screen.getByRole('button', { name: /40 credits for \$5\.99/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /540 credits for \$59\.99/i })).toBeInTheDocument()

    // Clicking a pack triggers sign-in instead of dropping into an un-authable Stripe checkout.
    await user.click(screen.getByRole('button', { name: /260 credits for \$29\.99/i }))
    expect(signIn).toHaveBeenCalledTimes(1)
  })
})

describe('the head copy and its Learn More', () => {
  // jsdom implements neither, and the jump uses both.
  const scrollIntoView = vi.fn()
  beforeEach(() => {
    vi.clearAllMocks()
    Element.prototype.scrollIntoView = scrollIntoView
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    })) as unknown as typeof window.matchMedia
  })

  it('should head the page with the designed copy', () => {
    renderPage()

    expect(screen.getByRole('heading', { name: 'Stock up on Credits' })).toBeTruthy()
    expect(
      screen.getByText(
        'Choose a Credit pack, then shop creator-made Wearables and Emotes to build a look that’s uniquely yours.'
      )
    ).toBeTruthy()
  })

  // The whole point of the change: it used to be an <a target="_blank"> to the docs. A reader who wants to
  // know what credits are should not lose the page they were about to buy on.
  it('should send Learn More down to the FAQ on this page rather than off-site', async () => {
    const user = userEvent.setup()
    renderPage()
    const learn = screen.getByTestId('credits-learn-more')

    expect(learn.tagName).toBe('BUTTON')
    expect(learn.getAttribute('href')).toBeNull()

    await user.click(learn)

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' })
    // …and the section it scrolled to is the one holding the answers.
    expect(screen.getByTestId('credits-faq').contains(screen.getByText('Do Credits expire?'))).toBe(true)
  })

  it('should jump without animating for a visitor who asked for less motion', async () => {
    window.matchMedia = ((query: string) => ({
      matches: true,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    })) as unknown as typeof window.matchMedia
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByTestId('credits-learn-more'))

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'center' })
  })
})

describe('the pack artwork fallback', () => {
  it('falls back to the bundled asset exactly once when the remote image fails', async () => {
    // The regression this guards: the handler used to compare `img.src` (which reads back an ABSOLUTE url)
    // against the bundled import (a root-relative path). That never matched, so a bundled asset which also
    // failed would re-assign src from inside its own error handler — an unbounded request loop.
    // Queried by tag, not by role: the artwork is decorative (alt="") so it is exposed as
    // role="presentation", which is correct for it and unfindable via getByRole('img').
    const { container } = renderPage()
    await screen.findAllByTestId('pack')
    const img = container.querySelector('[data-testid="pack"] img') as HTMLImageElement
    expect(img).toBeTruthy()

    fireEvent.error(img)
    const afterFirst = img.src
    expect(afterFirst).not.toBe('')
    expect(img.dataset.artFallback).toBe('done')

    // A second failure must NOT touch src again.
    fireEvent.error(img)
    expect(img.src).toBe(afterFirst)
  })
})
