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
const { waitForSettlement, SettlementPendingError, fetchOwnsItem } = vi.hoisted(() => {
  class SettlementPendingError extends Error {}
  return { waitForSettlement: vi.fn(), SettlementPendingError, fetchOwnsItem: vi.fn() }
})
vi.mock('~/lib/buy-gasless', () => ({ waitForSettlement, SettlementPendingError }))
// Partial mock: keep the real module (types + other exports) but stub the ownership check.
vi.mock('~/lib/api', async orig => ({ ...(await orig<Record<string, unknown>>()), fetchOwnsItem }))

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
    fetchOwnsItem.mockReset()
    fetchOwnsItem.mockResolvedValue(true) // default: indexer already reflects ownership
  })

  it('shows a processing state (never "It\'s yours!") while the tx is unconfirmed', async () => {
    waitForSettlement.mockReturnValue(new Promise(() => {})) // never settles
    renderSuccess()

    expect(await screen.findByText(/processing your purchase/i)).toBeTruthy()
    expect(screen.queryByText(/it.s yours/i)).toBeNull()
  })

  it('flips to "It\'s yours!" only once the tx confirms AND the indexer shows ownership', async () => {
    waitForSettlement.mockResolvedValue(undefined) // confirmed receipt
    fetchOwnsItem.mockResolvedValue(true) // owned + indexed
    renderSuccess()

    await waitFor(() => expect(screen.getByText(/it.s yours/i)).toBeTruthy())
    expect(screen.getByText(/is now in your wardrobe/i)).toBeTruthy()
  })

  it('shows a finalizing state (never "It\'s yours!") while the tx is mined but not yet indexed', async () => {
    waitForSettlement.mockResolvedValue(undefined) // receipt confirmed
    fetchOwnsItem.mockResolvedValue(false) // indexer hasn't caught up
    renderSuccess()

    expect(await screen.findByText(/finalizing your purchase/i)).toBeTruthy()
    expect(screen.queryByText(/it.s yours/i)).toBeNull()
  })

  it('shows a failure state (no wardrobe claim) when the tx reverts', async () => {
    waitForSettlement.mockRejectedValue(new Error('Purchase reverted'))
    renderSuccess()

    await waitFor(() => expect(screen.getByText(/didn.t go through/i)).toBeTruthy())
    expect(screen.queryByText(/it.s yours/i)).toBeNull()
  })

  it('lands on a timed-out state (not a false success or failure) when every attempt stays pending', async () => {
    waitForSettlement.mockRejectedValue(new SettlementPendingError('pending'))
    renderSuccess()

    // All attempts pending → no dead-end: surface "still processing, check My Purchases" — never a
    // false "It's yours!" and never a false "didn't go through" (the tx may still land).
    await waitFor(() => expect(screen.getByText(/still processing/i)).toBeTruthy())
    expect(screen.getByText(/view my purchases/i)).toBeTruthy()
    expect(screen.queryByText(/it.s yours/i)).toBeNull()
    expect(screen.queryByText(/didn.t go through/i)).toBeNull()
  })
})
