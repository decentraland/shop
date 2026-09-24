import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Session } from '~/lib/auth'
import type { SaleableCollection } from '~/lib/saleableCollections'

// decentraland-transactions ships an ESM directory import vitest cannot follow, so it is mocked wholesale
// (the workaround Cart.spec.tsx documents). The sale terms are still validated by the real ~/lib/coupons,
// which is what lets the flow reach its review step here.
vi.mock('decentraland-transactions', () => ({
  ContractName: { CouponManager: 'CouponManager', OffChainMarketplaceV2: 'OffChainMarketplaceV2' },
  getContract: (name: string) => ({ address: `0x${name}`, name, version: '1', abi: [] })
}))
vi.mock('~/lib/collections', () => ({ fetchCollectionItems: vi.fn().mockResolvedValue({ items: [], total: 0 }) }))

const track = vi.fn()
vi.mock('~/lib/analytics', () => ({
  track: (...args: unknown[]) => track(...args),
  errorCode: () => 'unknown'
}))

import { CreatorSaleModal, type SaleSource } from './CreatorSaleModal'

const session = { address: '0x' + 'cc'.repeat(20), providerType: 'injected' } as unknown as Session

const collection: SaleableCollection = {
  contractAddress: '0x' + 'aa'.repeat(20),
  name: 'Galaxy Drip',
  listedCount: 1,
  examplePriceCredits: 100,
  items: [{ key: 'k1', name: 'Galaxy Hat', thumbnail: '', priceCredits: 100, state: 'discounted', remainingSupply: 9 }]
}

function open(props: { source?: SaleSource; silent?: boolean; onClose?: () => void } = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <CreatorSaleModal
          session={session}
          collection={collection}
          onClose={props.onClose ?? vi.fn()}
          source={props.source ?? 'my_store'}
          silent={props.silent}
        />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

const named = (event: string) => track.mock.calls.filter(call => call[0] === event)

/**
 * The create-a-discount funnel, as the warehouse will read it: opened, reviewed, and either created or
 * abandoned. Creation itself is off-chain — a signed coupon posted to the marketplace server — so these
 * events are the only record of how far a creator got before stopping.
 */
describe('when a creator opens the discount flow', () => {
  beforeEach(() => track.mockReset())

  it('should record the opening once, with where it was opened from', () => {
    open({ source: 'my_assets' })

    expect(named('Shop Started Sale')).toHaveLength(1)
    expect(named('Shop Started Sale')[0][1]).toEqual({
      source: 'my_assets',
      collections_available: 1,
      preselected: true
    })
  })

  it('should record reaching the review step with the terms being reviewed', () => {
    open()
    fireEvent.click(screen.getByTestId('creator-sale-continue'))

    expect(named('Shop Reviewed Sale')).toHaveLength(1)
    expect(named('Shop Reviewed Sale')[0][1]).toEqual({
      source: 'my_store',
      discount_pct: 20,
      duration_h: 72,
      scheduled: false,
      capped: false
    })
  })

  it('should record leaving without a sale, and the step it was left on', () => {
    const onClose = vi.fn()
    open({ onClose })
    fireEvent.click(screen.getByTestId('creator-sale-continue'))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(named('Shop Abandoned Sale')).toHaveLength(1)
    expect(named('Shop Abandoned Sale')[0][1]).toEqual({ source: 'my_store', last_step: 'review' })
  })

  /**
   * A preview of someone else's store, or an invented one. A reviewer clicking through it is not a
   * creator's behaviour, and would land in the funnel attributed to the reviewer.
   */
  it('should record nothing at all when it is a preview', () => {
    open({ silent: true })
    fireEvent.click(screen.getByTestId('creator-sale-continue'))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(track).not.toHaveBeenCalled()
  })
})
