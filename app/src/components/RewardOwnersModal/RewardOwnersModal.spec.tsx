import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('decentraland-transactions', () => ({
  ContractName: {},
  getContract: () => ({}),
  sendMetaTransaction: vi.fn(),
  MetaTransactionError: class extends Error {},
  ErrorCode: {}
}))
vi.mock('~/config', () => ({ config: { chainId: 80002, rpcUrl: 'http://localhost' } }))
vi.mock('~/lib/profile', () => ({ fetchProfiles: vi.fn(() => Promise.resolve(new Map())) }))

import { RewardOwnersModal, type RewardItem } from '~/components/RewardOwnersModal'
import type { TopOwner } from '~/lib/owners'

function owner(n: number): TopOwner {
  return {
    address: `0x${String(n).padStart(40, '0')}`,
    nfts: 10 - n,
    items: 1,
    collections: 1,
    lastAcquiredAt: 0,
    spentWei: '0'
  }
}

const roomy: RewardItem = {
  contractAddress: '0xc',
  itemId: '0',
  name: 'Hat',
  thumbnail: '',
  collectionName: 'C',
  left: 100
}
const scarce: RewardItem = { ...roomy, itemId: '1', name: 'Crown', left: 3 }

function renderModal(props: Partial<Parameters<typeof RewardOwnersModal>[0]> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const onContinue = vi.fn()
  const loadOwners = vi.fn((count: number) => Promise.resolve(Array.from({ length: count }, (_, i) => owner(i))))
  render(
    <QueryClientProvider client={client}>
      <RewardOwnersModal
        creator="0xcreator"
        ownerCount={7}
        items={[roomy, scarce]}
        loadOwners={loadOwners}
        onContinue={onContinue}
        onClose={vi.fn()}
        onTrack={vi.fn()}
        {...props}
      />
    </QueryClientProvider>
  )
  return { onContinue, loadOwners }
}

describe('when rewarding the top owners of a store', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('and the store has fewer owners than the larger presets', () => {
    it('should offer only the sizes it can fill', () => {
      renderModal()

      expect(screen.getAllByRole('button', { name: /^Top / }).map(b => b.textContent)).toEqual(['Top 5', 'Top 7'])
    })
  })

  describe('and the creator continues with the defaults', () => {
    it('should hand the chosen item and every loaded address to the issue step', async () => {
      const { onContinue, loadOwners } = renderModal()
      await waitFor(() => expect(screen.getByTestId('reward-continue')).toBeEnabled())

      await userEvent.click(screen.getByTestId('reward-continue'))

      expect(loadOwners).toHaveBeenCalledWith(7, 'nfts')
      expect(onContinue).toHaveBeenCalledWith({
        item: roomy,
        recipients: Array.from({ length: 7 }, (_, i) => owner(i).address)
      })
    })
  })

  describe('and the chosen item has fewer copies left than recipients', () => {
    it('should not offer that item', async () => {
      renderModal()
      await waitFor(() => expect(screen.getByTestId('reward-continue')).toBeEnabled())

      expect(screen.getAllByTestId('reward-item')[1]).toBeDisabled()
    })
  })

  describe('and the list includes the creator themselves', () => {
    it('should leave the creator out of the recipients', async () => {
      const creator = owner(0).address
      const { onContinue } = renderModal({ creator })
      await waitFor(() => expect(screen.getByTestId('reward-continue')).toBeEnabled())

      await userEvent.click(screen.getByTestId('reward-continue'))

      expect((onContinue.mock.calls[0][0] as { recipients: string[] }).recipients).not.toContain(creator)
    })
  })
})
