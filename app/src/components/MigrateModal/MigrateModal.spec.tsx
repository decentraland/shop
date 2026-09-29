import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ProviderType } from '@dcl/schemas'
import type { ImportItem, ImportPhase } from '~/lib/import'
import type { Session } from '~/lib/auth'

// The modal pulls decentraland-transactions transitively through ~/lib/import; stub it so the module
// graph resolves under jsdom.
vi.mock('decentraland-transactions', () => ({
  ContractName: { OffChainMarketplaceV3: 'OffChainMarketplaceV3', OffChainMarketplaceV2: 'OffChainMarketplaceV2' },
  getContract: () => ({ address: '0xmarket', name: 'DecentralandMarketplacePolygon', version: '1', abi: [] })
}))

// importListing is held open on the phase under test: the label is what the row shows WHILE waiting, so
// a resolved call would race the assertion past it.
const emitPhase = vi.fn<(onPhase: (phase: ImportPhase) => void) => void>()
// Held open by default (the phase-label specs read what a row shows WHILE waiting); the outcome specs
// below override it so the run can actually finish.
const importListing = vi.fn(
  (_item: ImportItem, _credits: number, _session: Session, opts: { onPhase: (p: ImportPhase) => void }) =>
    new Promise<never>(() => emitPhase(opts.onPhase))
)
vi.mock('~/lib/import', async () => {
  const actual = await vi.importActual<typeof import('~/lib/import')>('~/lib/import')
  return {
    ...actual,
    countConfirmations: vi.fn().mockResolvedValue(null),
    importListing: (...args: Parameters<typeof importListing>) => importListing(...args)
  }
})

// Spied so the unlisted CTA's destination can be asserted; MemoryRouter still provides the rest.
const navigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => navigate }
})

vi.mock('~/lib/analytics', () => ({ track: vi.fn() }))
vi.mock('~/lib/monitoring', () => ({ captureError: vi.fn() }))

import { MigrateModal } from './MigrateModal'

/** Anything that only exists because there is a blockchain under the Shop. */
const WEB3_JARGON = /wallet|network|gas|chain|blockchain|transaction|sign|approv|confirm/i

function session(providerType: ProviderType): Session {
  return {
    address: '0xabc0000000000000000000000000000000000abc',
    chainId: 80002,
    signer: {} as never,
    web3Provider: {} as never,
    identity: {} as never,
    providerType
  }
}

const item: ImportItem = {
  oldTradeId: 'old-1',
  listingType: 'primary',
  contractAddress: '0xc0113c7104',
  itemId: '0',
  tokenId: null,
  name: 'Galaxy Hat',
  thumbnail: '',
  rarity: 'epic',
  category: 'wearable',
  wearableCategory: 'hat',
  manaWei: '100000000000000000000',
  available: 100,
  network: 'MATIC',
  chainId: 80002,
  suggestedCredits: 270
} as unknown as ImportItem

/** Renders the modal and drives the active row to `phase`. */
async function renderAtPhase(providerType: ProviderType, phase: ImportPhase) {
  render(
    <MemoryRouter>
      <MigrateModal
        queue={[{ item, priceCredits: 270 }]}
        session={session(providerType)}
        onClose={() => {}}
        onDone={() => {}}
      />
    </MemoryRouter>
  )
  // The row's onPhase only exists once the loop has called importListing.
  await vi.waitFor(() => expect(emitPhase).toHaveBeenCalled())
  const onPhase = emitPhase.mock.calls[0][0]
  await act(async () => onPhase(phase))
  // Read the ACTIVE row's caption specifically. Matching on text would have found the modal's own
  // status line instead, which is why the first version of this passed with the gate removed.
  return screen.getByTestId('migrate-active-status').textContent ?? ''
}

describe('MigrateModal — waiting for the cancel to settle', () => {
  beforeEach(() => emitPhase.mockClear())

  // A managed wallet never saw a chain step, so naming "the network" here introduces a system the owner
  // cannot see and cannot act on. This is the case the gate exists for.
  it('says nothing about the network to a managed wallet', async () => {
    const label = await renderAtPhase(ProviderType.MAGIC, { step: 'confirming-cancel' })
    expect(label).not.toMatch(WEB3_JARGON)
  })

  // The same wait IS informative to someone who just clicked confirm in MetaMask: it says which of the
  // two systems they are waiting on.
  it('names the network for a self-custody wallet', async () => {
    const label = await renderAtPhase(ProviderType.INJECTED, { step: 'confirming-cancel' })
    expect(label).toMatch(/network/i)
  })
})

describe('when the run finishes', () => {
  function renderModal(onClose = vi.fn(), onDone = vi.fn()) {
    render(
      <MemoryRouter>
        <MigrateModal
          queue={[{ item, priceCredits: 270 }]}
          session={session(ProviderType.INJECTED)}
          onClose={onClose}
          onDone={onDone}
        />
      </MemoryRouter>
    )
    return { onClose, onDone }
  }

  // No congratulations card: the list behind the modal refetches on close and says the same thing in
  // place — either the rows still to move, or the all-set state.
  it('closes itself when every row went through', async () => {
    importListing.mockResolvedValue(undefined as never)
    const onClose = vi.fn()
    const onDone = vi.fn()
    renderModal(onClose, onDone)

    await vi.waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(onDone).toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('reports what the run actually did, so the caller can tell a success from a failure', async () => {
    importListing.mockResolvedValue(undefined as never)
    const { onDone } = renderModal()

    await vi.waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(onDone).toHaveBeenCalledWith({ listed: 1, failed: 0, cancelled: 0 })
  })

  // A failure is never announced as a finished update: the modal holds, says so, and reports it.
  it('stays open on a failed item, with failure wording and no success claim', async () => {
    importListing.mockRejectedValue(new Error('boom'))
    const onClose = vi.fn()
    const onDone = vi.fn()
    renderModal(onClose, onDone)

    await vi.waitFor(() => expect(screen.getByTestId('migrate-failed')).toBeTruthy())
    expect(onClose).not.toHaveBeenCalled()
    const card = screen.getByTestId('migrate-failed')
    expect(card.textContent).toMatch(/couldn't be listed/i)
    expect(card.textContent).not.toMatch(/now for sale/i)
    // Nothing to re-list from My Items here: the old listing is still standing.
    expect(screen.queryByRole('button', { name: 'Go to My Items' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(onDone).toHaveBeenCalledWith({ listed: 0, failed: 1, cancelled: 0 })
  })

  // The one outcome that must NOT close itself: the old listing is gone and the re-list failed, so the
  // item is for sale nowhere and the seller has to go re-list it.
  it('stays open on an item left unlisted, and sends the seller to the creations tab', async () => {
    const { RelistFailedError } = await vi.importActual<typeof import('~/lib/import')>('~/lib/import')
    importListing.mockRejectedValue(new RelistFailedError('relist failed'))
    const onClose = vi.fn()
    renderModal(onClose)

    await vi.waitFor(() => expect(screen.getByTestId('migrate-unlisted')).toBeTruthy())
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Go to My Items' }))
    expect(navigate).toHaveBeenCalledWith('/my-items?section=creations')
  })
})
