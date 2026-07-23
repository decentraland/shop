import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const session = { address: '0xabc0000000000000000000000000000000000abc', providerType: 'injected' as never }
vi.mock('~/store/wallet', () => ({ useWallet: () => ({ session }) }))
// CreatorBadge (rendered on the confirmed screen for the item's creator) reads a profile via
// react-query — stub it so the row renders without a network fetch.
vi.mock('~/hooks/useProfile', () => ({ useProfile: () => ({ data: undefined }) }))

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

  it('shows the confirmed screen (green banner + item + CTAs) once the tx confirms AND the indexer shows ownership', async () => {
    waitForSettlement.mockResolvedValue(undefined) // confirmed receipt
    fetchOwnsItem.mockResolvedValue(true) // owned + indexed
    renderSuccess()

    // Figma "Purchase completed": success banner + the purchased item + the two CTAs.
    await waitFor(() => expect(screen.getByText(/your purchase was successful/i)).toBeTruthy())
    expect(screen.getByText(/my assets tab/i)).toBeTruthy()
    expect(screen.getByText('Snowy Panama Hat')).toBeTruthy()
    expect(screen.getByRole('button', { name: /my assets/i })).toBeTruthy()
    expect(screen.getByRole('link', { name: /try in world/i })).toBeTruthy()
  })

  it('shows the line total (per-unit × qty) and a "× N" badge for a multi-quantity line', async () => {
    waitForSettlement.mockResolvedValue(undefined)
    fetchOwnsItem.mockResolvedValue(true)
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    // priceCredits 5 × quantity 3 = 15 shown on the row, plus a "× 3" badge.
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter
          initialEntries={[{ pathname: '/success', state: { items: [{ ...item, quantity: 3 }], txHash: '0xabc' } }]}
        >
          <Routes>
            <Route path="/success" element={<Success />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    )
    await waitFor(() => expect(screen.getByText(/your purchase was successful/i)).toBeTruthy())
    expect(screen.getByText('15')).toBeTruthy()
    expect(screen.getByText(/×\s*3/)).toBeTruthy()
  })

  it('routes the MY ASSETS CTA to /my-assets', async () => {
    waitForSettlement.mockResolvedValue(undefined)
    fetchOwnsItem.mockResolvedValue(true)
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={[{ pathname: '/success', state: { items: [item], txHash: '0xabc' } }]}>
          <Routes>
            <Route path="/success" element={<Success />} />
            <Route path="/my-assets" element={<div>My Assets Page</div>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    )
    const btn = await screen.findByRole('button', { name: /my assets/i })
    btn.click()
    await waitFor(() => expect(screen.getByText('My Assets Page')).toBeTruthy())
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

  it('shows the added-credits row alongside the items for a buy-credits-and-item-together success', async () => {
    // settled:true → the cart already waited for settlement, so the confirmed screen renders straight away.
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter
          initialEntries={[{ pathname: '/success', state: { items: [item], settled: true, creditsAdded: 200 } }]}
        >
          <Routes>
            <Route path="/success" element={<Success />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    )
    const credits = await screen.findByTestId('success-credits')
    expect(credits.textContent).toMatch(/200/)
    expect(credits.textContent).toMatch(/added to your account/i)
    // Both the credits AND the purchased item are shown (Figma 1231-250927 combined view).
    expect(screen.getByText('Snowy Panama Hat')).toBeTruthy()
  })

  it('omits the added-credits row for a plain purchase (no top-up)', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={[{ pathname: '/success', state: { items: [item], settled: true } }]}>
          <Routes>
            <Route path="/success" element={<Success />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    )
    await screen.findByText('Snowy Panama Hat')
    expect(screen.queryByTestId('success-credits')).toBeNull()
  })

  it('lands on a timed-out state (not a false success or failure) when every attempt stays pending', async () => {
    waitForSettlement.mockRejectedValue(new SettlementPendingError('pending'))
    renderSuccess()

    // All attempts pending → no dead-end: surface "still processing, check your Activity" — never a
    // false "It's yours!" and never a false "didn't go through" (the tx may still land).
    await waitFor(() => expect(screen.getByText(/still processing/i)).toBeTruthy())
    expect(screen.getByText(/view your activity/i)).toBeTruthy()
    expect(screen.queryByText(/it.s yours/i)).toBeNull()
    expect(screen.queryByText(/didn.t go through/i)).toBeNull()
  })
})
