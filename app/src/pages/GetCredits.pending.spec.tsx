import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

/**
 * THE WEBHOOK-STILL-IN-FLIGHT SCREEN.
 *
 * Stripe has taken the money but its webhook has not reached us, so the balance is not up yet. The buyer
 * must be told the payment WORKED — the one thing they will otherwise assume is that it did not, and pay
 * twice. It lives in its own spec because forcing this outcome means stubbing the poll, and the main
 * GetCredits spec deliberately runs the real offline mock path end to end.
 */
const session = {
  address: '0xabc0000000000000000000000000000000000abc',
  chainId: 80002,
  signer: {} as never,
  web3Provider: {} as never,
  identity: {} as never,
  providerType: 'injected' as never
}

vi.mock('lottie-react', () => ({ default: () => <span data-testid="lottie" /> }))
vi.mock('~/store/wallet', () => ({
  useWallet: () => ({
    session,
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
vi.mock('~/lib/credits', () => ({ devMintUsd: vi.fn() }))

// Everything else in payments is left real — only the poll's answer is forced.
vi.mock('~/lib/payments', async importOriginal => {
  const actual = await importOriginal<typeof import('~/lib/payments')>()
  return { ...actual, pollCreditGrant: vi.fn().mockResolvedValue({ status: 'pending' }) }
})

import { GetCredits } from '~/pages/GetCredits'
import { CREDIT_PACKS } from '~/lib/payments'

function renderReturn() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  queryClient.setQueryData(['credit-packs'], CREDIT_PACKS)
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/?order=ord_pending_1']}>
        <GetCredits />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('when the payment lands but the webhook has not', () => {
  it('should say the credits are on the way, not that anything failed', async () => {
    renderReturn()

    const card = await screen.findByTestId('credits-pending', {}, { timeout: 4000 })
    expect(card).toHaveTextContent(/on the way/i)
    // The reassurance is the point of the screen: paid, and no reason to pay again.
    expect(card).toHaveTextContent(/no need to pay again/i)
    // Never an error tone — the money went through.
    expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument()
  })

  it('should offer both ways out of the screen', async () => {
    renderReturn()
    await screen.findByTestId('credits-pending', {}, { timeout: 4000 })

    expect(screen.getByRole('button', { name: /go shopping/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /got it/i })).toBeInTheDocument()
  })
})
