import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import type { CancelledTrade } from '~/lib/cancelled-trades'

vi.mock('~/config', async importActual => {
  const actual = await importActual<typeof import('~/config')>()
  return { config: { ...actual.config, marketplaceUrl: 'https://market.example' } }
})

const useManaRate = vi.fn()
vi.mock('~/hooks/useManaRate', () => ({ useManaRate: (...args: unknown[]) => useManaRate(...args) }))

let secondarySales = false
vi.mock('~/hooks/useSecondarySales', () => ({ useSecondarySales: () => secondarySales }))

import { CancelledListings } from './CancelledListings'

function trade(overrides: Partial<CancelledTrade> = {}): CancelledTrade {
  return {
    id: 'trade-1',
    type: 'public_item_order',
    network: 'MATIC',
    chainId: 137,
    contract: '0xmarket',
    reason: 'contract_signature_index_bump',
    createdAt: 1_700_000_000_000,
    expiresAt: 1_800_000_000_000,
    cancelledAt: 1_750_000_000_000,
    asset: { contractAddress: '0xc011', tokenId: null, itemId: '3', name: 'Galaxy Hat', image: 'hat.png' },
    price: { assetType: 2, amount: '2500000000000000000' },
    ...overrides
  }
}

describe('when listing the taken-down listings', () => {
  let trades: CancelledTrade[]

  beforeEach(() => {
    secondarySales = false
    useManaRate.mockReturnValue({ data: undefined })
    trades = []
  })

  function renderList() {
    render(
      <MemoryRouter>
        <CancelledListings trades={trades} />
      </MemoryRouter>
    )
  }

  describe('and there are none', () => {
    beforeEach(() => {
      renderList()
    })

    it('should render nothing', () => {
      expect(screen.queryByTestId('cancelled-listings')).not.toBeInTheDocument()
    })
  })

  describe('and a creation listing was taken down', () => {
    beforeEach(() => {
      trades = [trade()]
      renderList()
    })

    it('should show its name', () => {
      expect(screen.getByTestId('cancelled-listings-row')).toHaveTextContent('Galaxy Hat')
    })

    it('should show its old price in credits', () => {
      expect(screen.getByTestId('cancelled-listings-price')).toHaveTextContent('25')
    })

    it('should link to the item page in the Shop to put it back on sale', () => {
      expect(screen.getByTestId('cancelled-listings-action')).toHaveAttribute('href', '/item/0xc011/3')
    })

    it('should not ask for the live rate', () => {
      expect(useManaRate).toHaveBeenCalledWith(false)
    })
  })

  describe('and a listing priced in the classic currency was taken down', () => {
    beforeEach(() => {
      useManaRate.mockReturnValue({ data: { rate: 50_000_000n, decimals: 8 } })
      trades = [trade({ price: { assetType: 1, amount: '10000000000000000000' } })]
      renderList()
    })

    it('should ask for the live rate', () => {
      expect(useManaRate).toHaveBeenCalledWith(true)
    })

    it('should show the converted price', () => {
      expect(screen.getByTestId('cancelled-listings-price')).toHaveTextContent('50')
    })
  })

  describe('and a row has no price or name', () => {
    beforeEach(() => {
      trades = [
        trade({
          price: null,
          asset: { contractAddress: '0xc011', tokenId: null, itemId: '3', name: null, image: null }
        })
      ]
      renderList()
    })

    it('should fall back to a generic name', () => {
      expect(screen.getByTestId('cancelled-listings-row')).toHaveTextContent('Untitled item')
    })

    it('should leave the price out', () => {
      expect(screen.queryByTestId('cancelled-listings-price')).not.toBeInTheDocument()
    })
  })

  describe('and an offer was taken down', () => {
    let action: HTMLElement

    beforeEach(() => {
      trades = [
        trade({
          type: 'bid',
          asset: { contractAddress: '0xc011', tokenId: '42', itemId: null, name: 'Galaxy Hat', image: null }
        })
      ]
      renderList()
      action = within(screen.getByTestId('cancelled-listings-row')).getByTestId('cancelled-listings-action')
    })

    it('should label it as an offer', () => {
      expect(screen.getByTestId('cancelled-listings-row')).toHaveTextContent('Offer')
    })

    it('should open the marketplace in a new tab to make it again', () => {
      expect(action).toHaveAttribute('href', 'https://market.example/contracts/0xc011/tokens/42')
    })

    it('should say where the link goes', () => {
      expect(action).toHaveAttribute('target', '_blank')
    })

    it('should name the action for the item', () => {
      expect(action).toHaveAccessibleName(
        'Make offer again: Galaxy Hat (opens the Decentraland Marketplace in a new tab)'
      )
    })
  })

  describe('and only the first page of many is loaded', () => {
    let onLoadMore: ReturnType<typeof vi.fn>
    let originalObserver: typeof IntersectionObserver
    let observe: ReturnType<typeof vi.fn>

    function renderPaged(props: { isFetchingNextPage?: boolean; isFetchNextPageError?: boolean; autoLoad?: boolean }) {
      render(
        <MemoryRouter>
          <CancelledListings trades={trades} total={480} hasNextPage onLoadMore={onLoadMore} {...props} />
        </MemoryRouter>
      )
    }

    beforeEach(() => {
      trades = [trade({ id: 'a' }), trade({ id: 'b' })]
      onLoadMore = vi.fn()
      observe = vi.fn()
      originalObserver = globalThis.IntersectionObserver
      globalThis.IntersectionObserver = class {
        constructor(private cb: (entries: Array<{ isIntersecting: boolean }>) => void) {}
        observe() {
          observe()
          this.cb([{ isIntersecting: true }])
        }
        disconnect() {}
      } as unknown as typeof IntersectionObserver
    })

    afterEach(() => {
      globalThis.IntersectionObserver = originalObserver
    })

    describe('and the sentinel scrolls into view', () => {
      beforeEach(() => {
        renderPaged({})
      })

      it('should show the total across every page', () => {
        expect(screen.getByTestId('cancelled-listings-count')).toHaveTextContent('480 items')
      })

      it('should ask for the next page', () => {
        expect(onLoadMore).toHaveBeenCalledTimes(1)
      })
    })

    describe('and the next page is on its way', () => {
      beforeEach(() => {
        renderPaged({ isFetchingNextPage: true })
      })

      it('should show placeholder rows under the loaded ones', () => {
        expect(screen.getAllByTestId('cancelled-listings-loading')).toHaveLength(3)
      })

      it('should say it is loading', () => {
        expect(screen.getByRole('button', { name: 'Loading…' })).toBeDisabled()
      })
    })

    describe('and the next page failed', () => {
      beforeEach(async () => {
        renderPaged({ isFetchNextPageError: true })
        await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
      })

      it('should retry only when asked', () => {
        expect(onLoadMore).toHaveBeenCalledTimes(1)
      })
    })

    describe('and more content sits below the list', () => {
      beforeEach(() => {
        renderPaged({ autoLoad: false })
      })

      it('should not load on scroll', () => {
        expect(observe).not.toHaveBeenCalled()
      })

      it('should offer to load more by hand', () => {
        expect(screen.getByRole('button', { name: 'Load more' })).toBeEnabled()
      })
    })
  })
})
