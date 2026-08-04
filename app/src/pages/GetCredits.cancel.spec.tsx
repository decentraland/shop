import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

/**
 * Returning from Stripe's hosted page is a COLD BOOT of the app — we navigated away to Stripe, so
 * nothing survives. The wallet session is restored asynchronously and is null on the first render.
 *
 * That is the whole subject of this file. An earlier version of the cancel handling latched its
 * "already handled" flag before checking for a session, so on the real return path the retire call
 * was skipped and the re-run (once the identity arrived) bailed at the guard — the order was never
 * retired and sat in Activity looking live until Stripe aged the session out a day later. The bug
 * was invisible to the existing GetCredits specs precisely because their wallet mock hands back a
 * session synchronously, which no real return ever does.
 */

const session = {
  address: '0xabc0000000000000000000000000000000000abc',
  chainId: 80002,
  signer: {} as never,
  web3Provider: {} as never,
  identity: {} as never,
  providerType: 'injected' as never
}

// Mutable so a test can drive the restore sequence: null/not-restored first, then the real answer.
let currentSession: typeof session | null = null
let currentRestored = false

vi.mock('~/store/wallet', () => ({
  useWallet: () => ({
    session: currentSession,
    restored: currentRestored,
    connecting: false,
    error: null,
    signIn: vi.fn(),
    restore: vi.fn(),
    disconnect: vi.fn()
  })
}))

vi.mock('decentraland-ui2', () => ({
  CircularProgress: ({ size }: { size?: number }) => <span role="progressbar" data-size={size} />
}))

const cancelCreditOrder = vi.fn().mockResolvedValue(undefined)
vi.mock('~/lib/credits', () => ({
  devMintUsd: vi.fn(),
  cancelCreditOrder: (...args: unknown[]) => cancelCreditOrder(...args)
}))

import { GetCredits } from '~/pages/GetCredits'
import { CREDIT_PACKS } from '~/lib/payments'

function renderPage(initialEntry: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  qc.setQueryData(['credit-packs'], CREDIT_PACKS)
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <GetCredits />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  cancelCreditOrder.mockClear()
  currentSession = null
  currentRestored = false
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('when returning from a cancelled Stripe checkout', () => {
  describe('and the wallet session has not been restored yet', () => {
    it('should retire the order once the identity arrives, not give up on the first render', async () => {
      const { rerender } = renderPage('/?order=ord_1&canceled=1')

      // First render: the restore has not finished. Nothing can be signed yet, so nothing is sent —
      // and, critically, the handler must NOT consider itself done.
      expect(cancelCreditOrder).not.toHaveBeenCalled()

      currentSession = session
      currentRestored = true
      rerender(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <MemoryRouter initialEntries={['/?order=ord_1&canceled=1']}>
            <GetCredits />
          </MemoryRouter>
        </QueryClientProvider>
      )

      await waitFor(() => expect(cancelCreditOrder).toHaveBeenCalledWith('ord_1', session.identity))
    })
  })

  describe('and the session is already available', () => {
    it('should retire the order straight away', async () => {
      currentSession = session
      currentRestored = true

      renderPage('/?order=ord_2&canceled=1')

      await waitFor(() => expect(cancelCreditOrder).toHaveBeenCalledWith('ord_2', session.identity))
    })
  })

  describe('and the visitor has no wallet at all', () => {
    // `restored` is true with no session: the restore ran and found nothing. There is no identity to
    // sign with, so nothing is sent — but the buyer must still get their note rather than a page that
    // waits forever for a wallet that is not coming.
    it('should show the cancelled note without trying to retire anything', async () => {
      currentSession = null
      currentRestored = true

      renderPage('/?order=ord_3&canceled=1')

      expect(await screen.findByText(/payment canceled/i)).toBeInTheDocument()
      expect(cancelCreditOrder).not.toHaveBeenCalled()
    })
  })

  describe('and there is no order id on the return', () => {
    // The mock-payments path cancels without one. Nothing to retire; the note still shows.
    it('should show the note and send nothing', async () => {
      currentSession = session
      currentRestored = true

      renderPage('/?canceled=1')

      expect(await screen.findByText(/payment canceled/i)).toBeInTheDocument()
      expect(cancelCreditOrder).not.toHaveBeenCalled()
    })
  })
})
