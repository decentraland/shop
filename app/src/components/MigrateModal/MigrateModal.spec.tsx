import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ProviderType } from '@dcl/schemas'
import type { ImportItem, ImportPhase } from '~/lib/import'
import type { Session } from '~/lib/auth'

// The modal pulls decentraland-transactions transitively through ~/lib/import; stub it so the module
// graph resolves under jsdom.
vi.mock('decentraland-transactions', () => ({
  ContractName: { OffChainMarketplaceV2: 'OffChainMarketplaceV2' },
  getContract: () => ({ address: '0xmarket', name: 'DecentralandMarketplacePolygon', version: '1', abi: [] })
}))

// importListing is held open on the phase under test: the label is what the row shows WHILE waiting, so
// a resolved call would race the assertion past it.
const emitPhase = vi.fn<(onPhase: (phase: ImportPhase) => void) => void>()
vi.mock('~/lib/import', async () => {
  const actual = await vi.importActual<typeof import('~/lib/import')>('~/lib/import')
  return {
    ...actual,
    countConfirmations: vi.fn().mockResolvedValue(null),
    importListing: (
      _item: ImportItem,
      _credits: number,
      _session: Session,
      opts: { onPhase: (p: ImportPhase) => void }
    ) => new Promise<never>(() => emitPhase(opts.onPhase))
  }
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
