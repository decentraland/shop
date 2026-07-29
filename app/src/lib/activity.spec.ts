import { describe, it, expect, vi } from 'vitest'

// ~/lib/activity imports the (real) MANA→credit conversion from ~/lib/mana-rate, which pulls in
// decentraland-transactions at module load — stub it so the module resolves. The conversion math under
// test uses none of it, so the real manaWeiToCredits still runs.
vi.mock('decentraland-transactions', () => ({
  ContractName: { OffChainMarketplaceV2: 'OffChainMarketplaceV2' },
  getContract: () => ({ address: '0xmarket', name: 'DecentralandMarketplacePolygon', version: '1', abi: [] })
}))

import { buildActivityFeed, filterActivity, toActivitySale } from '~/lib/activity'
import type { PurchaseRecord, CreditOrder } from '~/lib/credits'
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

function creditOrder(overrides: Partial<CreditOrder> = {}): CreditOrder {
  return {
    id: 'co-' + Math.random().toString(36).slice(2),
    credits: 100,
    usdCents: 1000,
    status: 'credited',
    createdAt: 3_000,
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

  it('should merge credit-pack purchases into the feed as credit entries, newest first', () => {
    const feed = buildActivityFeed({
      purchases: [purchase({ txHash: '0xp', createdAt: 1_000 })],
      sales: [sale({ createdAt: 2_000 })],
      creditOrders: [creditOrder({ createdAt: 3_000 })]
    })
    expect(feed.map(e => e.kind)).toEqual(['credit', 'sale', 'purchase'])
  })

  // These fixtures must use the CREDITS-SERVER's status words. The previous version passed 'EXPIRED' and
  // asserted it was dropped — and passed, because the filter compared against 'EXPIRED' too. Both sides
  // agreed with each other and disagreed with the server, which never sends it, so in production nothing
  // was ever filtered. A fixture typed from a wrong type cannot catch that type being wrong.
  it('should drop failed credit orders (the charge never succeeded)', () => {
    const feed = buildActivityFeed({
      purchases: [],
      sales: [],
      creditOrders: [creditOrder({ status: 'failed' })]
    })
    expect(feed).toHaveLength(0)
  })

  it('should drop abandoned credit orders (a checkout opened and never paid)', () => {
    // The row is written when the pack is CLICKED, so merely looking at one used to leave an order showing
    // as PROCESSING forever — which reads as "you are owed credits". The server retires these on a timer.
    const feed = buildActivityFeed({
      purchases: [],
      sales: [],
      creditOrders: [creditOrder({ status: 'abandoned' })]
    })
    expect(feed).toHaveLength(0)
  })

  it.each(['processing', 'crediting', 'credited'] as const)('should keep a %s credit order', status => {
    // 'processing' included on purpose: now that dead orders are retired server-side, it means what it says
    // — paid or payable, not yet credited — and hiding those would hide money the buyer is waiting on.
    const feed = buildActivityFeed({ purchases: [], sales: [], creditOrders: [creditOrder({ status })] })
    expect(feed).toHaveLength(1)
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

  it('should include credit-pack purchases under the "purchases" filter (a credit buy is a purchase)', () => {
    const withCredit = buildActivityFeed({
      purchases: [purchase({ txHash: '0xp', createdAt: 1_000 })],
      sales: [sale({ createdAt: 2_000 })],
      creditOrders: [creditOrder({ createdAt: 3_000 })]
    })
    const purchases = filterActivity(withCredit, 'purchases')
    expect(purchases.map(e => e.kind).sort()).toEqual(['credit', 'purchase'])
    // …and never leak into the sales tab.
    expect(filterActivity(withCredit, 'sales').map(e => e.kind)).toEqual(['sale'])
  })
})

describe('MANA-paid purchases', () => {
  // A purchase settled entirely in MANA authorizes no credits, so credits-server has no record of it.
  // The buyer side of the chain is the only trace — without it the item lands in My Assets and the buyer
  // sees nothing in Activity at all.
  const buyerSale = (over: Partial<SaleRecord> = {}): SaleRecord => ({
    id: 'sale-1',
    buyer: '0xme',
    seller: '0xseller',
    contractAddress: '0xcollection',
    tokenId: '7',
    itemId: null,
    manaWei: '10000000000000000000',
    createdAt: 1_700_000_000_000,
    txHash: '0xTX',
    category: 'wearable',
    ...over
  })

  it('lists a MANA purchase that no credits intent backs', () => {
    const feed = buildActivityFeed({ purchases: [], sales: [], manaPurchases: [buyerSale()] })
    expect(feed.map(e => e.kind)).toEqual(['mana-purchase'])
  })

  it('does NOT list it twice when the same purchase also spent credits', () => {
    // A credits checkout settles on-chain too, so it shows up on the buyer side as well. Matching the
    // settlement tx is what keeps one purchase from being listed once per source.
    const purchase = {
      id: 'p1',
      tradeId: 't1',
      usdCents: 1000,
      credits: 100,
      status: 'SETTLED' as const,
      createdAt: 1_700_000_000_000,
      manaSettledWei: null,
      txHash: '0xtx' // deliberately different case from the sale's 0xTX
    }
    const feed = buildActivityFeed({ purchases: [purchase], sales: [], manaPurchases: [buyerSale()] })
    expect(feed.filter(e => e.kind === 'mana-purchase')).toEqual([])
    expect(feed.filter(e => e.kind === 'purchase').length).toBe(1)
  })

  it('keeps a MANA purchase whose tx differs from every credits intent', () => {
    const purchase = {
      id: 'p1',
      tradeId: 't1',
      usdCents: 1000,
      credits: 100,
      status: 'SETTLED' as const,
      createdAt: 1_700_000_000_000,
      manaSettledWei: null,
      txHash: '0xother'
    }
    const feed = buildActivityFeed({ purchases: [purchase], sales: [], manaPurchases: [buyerSale()] })
    expect(feed.filter(e => e.kind === 'mana-purchase').length).toBe(1)
  })

  it('counts as a purchase under the Purchases filter, not under Sales', () => {
    const feed = buildActivityFeed({ purchases: [], sales: [], manaPurchases: [buyerSale()] })
    expect(filterActivity(feed, 'purchases').length).toBe(1)
    expect(filterActivity(feed, 'sales')).toEqual([])
  })
})
