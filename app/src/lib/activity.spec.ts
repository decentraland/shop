import { describe, it, expect, vi } from 'vitest'

// ~/lib/activity imports the (real) MANA→credit conversion from ~/lib/mana-rate, which pulls in
// decentraland-transactions at module load — stub it so the module resolves. The conversion math under
// test uses none of it, so the real manaWeiToCredits still runs.
vi.mock('decentraland-transactions', () => ({
  ContractName: { OffChainMarketplaceV2: 'OffChainMarketplaceV2' },
  getContract: () => ({ address: '0xmarket', name: 'DecentralandMarketplacePolygon', version: '1', abi: [] })
}))

import { buildActivityFeed, filterActivity, toActivitySale } from '~/lib/activity'
import type { PurchaseRecord } from '~/lib/credits'
import type { SaleRecord } from '~/lib/api'
import type { ManaRate } from '~/lib/mana-rate'

// 1 MANA = $0.50 (8-decimal aggregator) → 10 MANA = $5 = 50 credits.
const RATE: ManaRate = { rate: 50_000_000n, decimals: 8 }

function purchase(overrides: Partial<PurchaseRecord> = {}): PurchaseRecord {
  return {
    id: Math.random().toString(36).slice(2),
    tradeId: 't-' + Math.random().toString(36).slice(2),
    usdCents: 100,
    credits: 10,
    status: 'SETTLED',
    createdAt: 1_000,
    manaSettledWei: null,
    txHash: null,
    ...overrides
  }
}

function sale(overrides: Partial<SaleRecord> = {}): SaleRecord {
  return {
    id: 'sale-' + Math.random().toString(36).slice(2),
    buyer: '0xbuyer',
    seller: '0xseller',
    contractAddress: '0xc',
    tokenId: '1',
    itemId: null,
    manaWei: '10000000000000000000', // 10 MANA
    createdAt: 2_000,
    txHash: '0xhash',
    category: 'wearable',
    ...overrides
  }
}

describe('toActivitySale', () => {
  it('should convert the MANA settlement price to indicative credits at the given rate', () => {
    const result = toActivitySale(sale({ manaWei: '10000000000000000000' }), RATE)
    expect(result.credits).toBe(50)
  })

  it('should leave credits null when no rate is available (rather than showing a fake amount)', () => {
    const result = toActivitySale(sale(), undefined)
    expect(result.credits).toBeNull()
  })

  it('should carry the buyer as the counterparty account', () => {
    const result = toActivitySale(sale({ buyer: '0xabc' }), RATE)
    expect(result.counterparty).toBe('0xabc')
  })
})

describe('buildActivityFeed', () => {
  it('should drop EXPIRED purchase intents (released, never bought)', () => {
    const feed = buildActivityFeed({
      purchases: [purchase({ status: 'EXPIRED' })],
      sales: []
    })
    expect(feed).toHaveLength(0)
  })

  it('should group a multi-line cart checkout into ONE purchase entry (preserving order grouping)', () => {
    const feed = buildActivityFeed({
      purchases: [
        purchase({ id: 'a', tradeId: 't1', txHash: '0xcart', createdAt: 1_002 }),
        purchase({ id: 'b', tradeId: 't2', txHash: '0xcart', createdAt: 1_001 }),
        purchase({ id: 'c', tradeId: 't3', txHash: '0xcart', createdAt: 1_000 })
      ],
      sales: []
    })
    expect(feed).toHaveLength(1)
    expect(feed[0].kind).toBe('purchase')
    if (feed[0].kind === 'purchase') expect(feed[0].order.lines).toHaveLength(3)
  })

  it('should merge purchases and sales into one feed, newest first', () => {
    const feed = buildActivityFeed({
      purchases: [purchase({ txHash: '0xp', createdAt: 1_000 })],
      sales: [sale({ createdAt: 2_000 })],
      rate: RATE
    })
    expect(feed.map(e => e.kind)).toEqual(['sale', 'purchase'])
  })

  it('should be deterministic for entries sharing a timestamp', () => {
    const input = {
      purchases: [purchase({ txHash: '0xp', createdAt: 5_000 })],
      sales: [sale({ id: 'sale-x', createdAt: 5_000 })],
      rate: RATE
    }
    expect(buildActivityFeed(input).map(e => e.id)).toEqual(buildActivityFeed(input).map(e => e.id))
  })
})

describe('filterActivity', () => {
  const feed = buildActivityFeed({
    purchases: [purchase({ txHash: '0xp', createdAt: 1_000 })],
    sales: [sale({ createdAt: 2_000 })],
    rate: RATE
  })

  it('should return everything for the "all" filter', () => {
    expect(filterActivity(feed, 'all')).toHaveLength(2)
  })

  it('should return only purchases for the "purchases" filter', () => {
    const result = filterActivity(feed, 'purchases')
    expect(result).toHaveLength(1)
    expect(result[0].kind).toBe('purchase')
  })

  it('should return only sales for the "sales" filter', () => {
    const result = filterActivity(feed, 'sales')
    expect(result).toHaveLength(1)
    expect(result[0].kind).toBe('sale')
  })
})
