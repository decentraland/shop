import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Trade } from '@dcl/schemas'
import type { CatalogItem } from '~/lib/api'

// Only resolveLiveTrade is stubbed; usdWeiToCents + TradeNotFoundError stay real so the classifier and
// the not-found branch exercise the production code paths.
vi.mock('~/lib/api', async importActual => {
  const actual = await importActual<typeof import('~/lib/api')>()
  return { ...actual, resolveLiveTrade: vi.fn() }
})

import { resolveLiveTrade, TradeNotFoundError } from '~/lib/api'
import { classifyTrade, isLineBuyable, resolveLineAvailability } from '~/lib/cart-availability'

const resolveMock = vi.mocked(resolveLiveTrade)

// A USD-pegged trade: received amount is USD wei (1e18 = $1), so $2 → 2e18 wei. Optional expiration is
// epoch ms (the shape fetchTrade returns).
const trade = (dollars: number, expiration?: number): Trade =>
  ({
    received: [{ amount: (BigInt(Math.round(dollars * 100)) * 10n ** 16n).toString() }],
    ...(expiration != null ? { checks: { expiration } } : {})
  }) as unknown as Trade

const primary = { itemId: 'item-1', contractAddress: '0xc', tradeId: 'trade-1' } as Partial<CatalogItem>
const secondary = { tokenId: '42', contractAddress: '0xc', tradeId: 'trade-2' } as Partial<CatalogItem>

describe('cart-availability', () => {
  beforeEach(() => resolveMock.mockReset())

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
  })
})
