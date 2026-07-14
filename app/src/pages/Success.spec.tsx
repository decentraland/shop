import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const session = { address: '0xabc0000000000000000000000000000000000abc', providerType: 'injected' as never }
vi.mock('~/store/wallet', () => ({ useWallet: () => ({ session }) }))
vi.mock('~/hooks/useProfile', () => ({ useProfile: () => ({ data: undefined }) }))
// Avoid the lazy 3D iframe (decentraland-ui2 ESM) + the confetti animation in jsdom.
vi.mock('~/components/LazyWearablePreview', () => ({ WearablePreview: () => <div data-testid="preview" /> }))
vi.mock('~/components/SuccessAnimation', () => ({ SuccessAnimation: () => <div data-testid="success-anim" /> }))

// Real SettlementPendingError class (the hook branches on `instanceof`) + a mockable waitForSettlement.
// vi.hoisted so both exist before the hoisted vi.mock factory runs, and are usable in the tests.
const { waitForSettlement, SettlementPendingError } = vi.hoisted(() => {
  class SettlementPendingError extends Error {}
  return { waitForSettlement: vi.fn(), SettlementPendingError }
})
vi.mock('~/lib/buy-gasless', () => ({ waitForSettlement, SettlementPendingError }))

// eslint-disable-next-line import/first
import { Success } from '~/pages/Success'

const item = {
  id: 'i1',
  name: 'Snowy Panama Hat',
  creator: '0xcreator',
  contractAddress: '0x1ad432344191907029728f81382e6704d8e50623',
  itemId: '3',
  category: 'wearable',
  rarity: 'legendary',
  network: 'MATIC',
  chainId: 80002,
  thumbnail: '',
  priceCredits: 5,
  gender: 'unisex'
}

function renderSuccess(txHash: string | undefined = '0xdeadbeef') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[{ pathname: '/success', state: { items: [item], txHash } }]}>
        <Routes>
          <Route path="/success" element={<Success />} />
          <Route path="/assets" element={<div>Browse</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('Success settlement gating', () => {
  beforeEach(() => {
    waitForSettlement.mockReset()
  })

  it('shows a processing state (never "It\'s yours!") while the tx is unconfirmed', async () => {
    waitForSettlement.mockReturnValue(new Promise(() => {})) // never settles
    renderSuccess()

    expect(await screen.findByText(/processing your purchase/i)).toBeTruthy()
    expect(screen.queryByText(/it.s yours/i)).toBeNull()
  })

  it('flips to "It\'s yours!" once the tx confirms', async () => {
    waitForSettlement.mockResolvedValue(undefined) // confirmed receipt
    renderSuccess()

    await waitFor(() => expect(screen.getByText(/it.s yours/i)).toBeTruthy())
    expect(screen.getByText(/is now in your wardrobe/i)).toBeTruthy()
  })

  it('shows a failure state (no wardrobe claim) when the tx reverts', async () => {
    waitForSettlement.mockRejectedValue(new Error('Purchase reverted'))
    renderSuccess()

    await waitFor(() => expect(screen.getByText(/didn.t go through/i)).toBeTruthy())
    expect(screen.queryByText(/it.s yours/i)).toBeNull()
  })

  it('keeps waiting through pending timeouts without a false success', async () => {
    waitForSettlement.mockRejectedValue(new SettlementPendingError('pending'))
    renderSuccess()

    // Every attempt is "pending" → the page must stay in processing, never claim success.
    expect(await screen.findByText(/processing your purchase/i)).toBeTruthy()
    await waitFor(() => expect(waitForSettlement).toHaveBeenCalled())
    expect(screen.queryByText(/it.s yours/i)).toBeNull()
  })
})
