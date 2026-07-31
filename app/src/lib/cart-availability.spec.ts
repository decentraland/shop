import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Trade } from '@dcl/schemas'
import type { CatalogItem } from '~/lib/api'

// Only resolveLiveTrade is stubbed; usdWeiToCents + TradeNotFoundError stay real so the classifier and
// the not-found branch exercise the production code paths.
vi.mock('~/lib/api', async importActual => {
  const actual = await importActual<typeof import('~/lib/api')>()
  return { ...actual, resolveLiveTrade: vi.fn(), fetchStoreMintState: vi.fn() }
})

import { resolveLiveTrade, fetchStoreMintState, TradeNotFoundError } from '~/lib/api'
import { classifyTrade, classifyStoreMint, isLineBuyable, resolveLineAvailability } from '~/lib/cart-availability'

const resolveMock = vi.mocked(resolveLiveTrade)
const storeMock = vi.mocked(fetchStoreMintState)

// A USD-pegged trade: received amount is USD wei (1e18 = $1), so $2 → 2e18 wei. Optional expiration is
// epoch ms (the shape fetchTrade returns).
const trade = (dollars: number, expiration?: number): Trade =>
  ({
    received: [{ amount: (BigInt(Math.round(dollars * 100)) * 10n ** 16n).toString() }],
    ...(expiration != null ? { checks: { expiration } } : {})
  }) as unknown as Trade

const primary = { itemId: 'item-1', contractAddress: '0xc', tradeId: 'trade-1' } as Partial<CatalogItem>
const secondary = { tokenId: '42', contractAddress: '0xc', tradeId: 'trade-2' } as Partial<CatalogItem>
// A CollectionStore mint: no tradeId at all — its availability comes from live stock, not from a trade.
const mint = { itemId: '12', contractAddress: '0xstore', acquisition: 'store' } as Partial<CatalogItem>

describe('cart-availability', () => {
  beforeEach(() => {
    resolveMock.mockReset()
    storeMock.mockReset()
  })

  describe('classifyTrade', () => {
    it('when the trade resolves with a positive price it is available', () => {
      expect(classifyTrade(primary, trade(2))).toBe('available')
    })

    it('when there is no live trade a primary (mint) line is sold-out', () => {
      expect(classifyTrade({ tokenId: undefined }, null)).toBe('sold-out')
    })

    it('when there is no live trade a secondary (token) line is unavailable', () => {
      expect(classifyTrade({ tokenId: '42' }, null)).toBe('unavailable')
    })

    it('when the trade has expired it is unavailable', () => {
      expect(classifyTrade(primary, trade(2, Date.now() - 60_000))).toBe('unavailable')
    })

    it('when the expiration is still in the future it stays available', () => {
      expect(classifyTrade(primary, trade(2, Date.now() + 60_000))).toBe('available')
    })

    it('when the price is zero it is unavailable', () => {
      expect(classifyTrade(primary, trade(0))).toBe('unavailable')
    })
  })

  describe('classifyStoreMint', () => {
    it('when stock remains at a positive price it is available', () => {
      expect(classifyStoreMint({ priceWei: '1000000000000000000', available: 93 })).toBe('available')
    })

    it('when the item is no longer mintable through the store it is sold-out', () => {
      expect(classifyStoreMint(null)).toBe('sold-out')
    })

    it('when the supply is exhausted it is sold-out', () => {
      expect(classifyStoreMint({ priceWei: '1000000000000000000', available: 0 })).toBe('sold-out')
    })

    it('when the price is zero or unreadable it is unavailable', () => {
      expect(classifyStoreMint({ priceWei: '0', available: 5 })).toBe('unavailable')
      expect(classifyStoreMint({ priceWei: 'nonsense', available: 5 })).toBe('unavailable')
    })

    it('stays available when stock is short of the requested quantity — the stepper caps it and reviewCart re-checks', () => {
      // Regression guard for the words: a line asking for more copies than remain must NOT read
      // "Out of stock", which would hide a line the buyer can still get by lowering the count.
      expect(classifyStoreMint({ priceWei: '1000000000000000000', available: 1 })).toBe('available')
    })
  })

  describe('isLineBuyable', () => {
    it('treats available and the optimistic unknown (undefined) as buyable', () => {
      expect(isLineBuyable('available')).toBe(true)
      expect(isLineBuyable(undefined)).toBe(true)
    })

    it('treats sold-out and unavailable as not buyable', () => {
      expect(isLineBuyable('sold-out')).toBe(false)
      expect(isLineBuyable('unavailable')).toBe(false)
    })
  })

  describe('resolveLineAvailability', () => {
    it('classifies a resolved live trade', async () => {
      resolveMock.mockResolvedValueOnce(trade(3))
      await expect(resolveLineAvailability(primary as CatalogItem)).resolves.toBe('available')
    })

    it('maps a null resolution to sold-out for a primary line', async () => {
      resolveMock.mockResolvedValueOnce(null)
      await expect(resolveLineAvailability(primary as CatalogItem)).resolves.toBe('sold-out')
    })

    it('maps a TradeNotFoundError to unavailable for a secondary line', async () => {
      resolveMock.mockRejectedValueOnce(new TradeNotFoundError('trade-2'))
      await expect(resolveLineAvailability(secondary as CatalogItem)).resolves.toBe('unavailable')
    })

    it('propagates a non-not-found error so the caller can stay optimistic', async () => {
      resolveMock.mockRejectedValueOnce(new Error('network down'))
      await expect(resolveLineAvailability(primary as CatalogItem)).rejects.toThrow('network down')
    })

    // The bug this branch exists for: a store line has no trade, so resolveLiveTrade could only ever fail
    // on it, and the failure classified as sold-out — every CollectionStore line showed "Out of stock" and
    // was dropped from the total and from checkout.
    it('reads a store line from live mint state instead of asking for a trade', async () => {
      storeMock.mockResolvedValueOnce({ priceWei: '1000000000000000000', available: 93 })
      await expect(resolveLineAvailability(mint as CatalogItem)).resolves.toBe('available')
      expect(storeMock).toHaveBeenCalledWith('0xstore', '12')
      expect(resolveMock).not.toHaveBeenCalled()
    })

    it('maps a store line with no live mint state to sold-out', async () => {
      storeMock.mockResolvedValueOnce(null)
      await expect(resolveLineAvailability(mint as CatalogItem)).resolves.toBe('sold-out')
    })

    it('propagates a store lookup failure so the caller can stay optimistic', async () => {
      storeMock.mockRejectedValueOnce(new Error('network down'))
      await expect(resolveLineAvailability(mint as CatalogItem)).rejects.toThrow('network down')
    })

    it('treats a store line missing its contract/item as unavailable without a lookup', async () => {
      await expect(
        resolveLineAvailability({ acquisition: 'store', contractAddress: '0xstore' } as CatalogItem)
      ).resolves.toBe('unavailable')
      expect(storeMock).not.toHaveBeenCalled()
    })

    // A cart persisted before `acquisition` existed carries no value, and every one of those lines is a
    // trade — so an absent field must keep taking the trade path, not the store one.
    it('still takes the trade path when acquisition is absent (a pre-existing persisted cart)', async () => {
      resolveMock.mockResolvedValueOnce(trade(3))
      await expect(resolveLineAvailability(primary as CatalogItem)).resolves.toBe('available')
      expect(storeMock).not.toHaveBeenCalled()
    })
  })
})
