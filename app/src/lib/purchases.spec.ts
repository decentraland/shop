import { describe, it, expect } from 'vitest'
import { groupPurchases, foldOrderLines } from '~/lib/purchases'
import type { PurchaseRecord } from '~/lib/credits'

function record(overrides: Partial<PurchaseRecord> = {}): PurchaseRecord {
  return {
    id: Math.random().toString(36).slice(2),
    tradeId: 't-' + Math.random().toString(36).slice(2),
    usdCents: 100,
    credits: 10,
    status: 'SETTLED',
    createdAt: 1_000_000,
    manaSettledWei: null,
    txHash: null,
    ...overrides
  }
}

describe('when grouping purchase records into orders', () => {
  it('should fold lines that share a settlement tx hash into one order', () => {
    const records = [
      record({ id: 'a', txHash: '0xcart', createdAt: 5000, credits: 10 }),
      record({ id: 'b', txHash: '0xcart', createdAt: 5001, credits: 27 }),
      record({ id: 'c', txHash: '0xcart', createdAt: 5002, credits: 3 })
    ]
    const orders = groupPurchases(records)
    expect(orders).toHaveLength(1)
    expect(orders[0].lines).toHaveLength(3)
    expect(orders[0].totalCredits).toBe(40)
    expect(orders[0].id).toBe('0xcart')
  })

  it('should keep purchases with different tx hashes as separate orders', () => {
    const orders = groupPurchases([
      record({ txHash: '0xone', createdAt: 5000 }),
      record({ txHash: '0xtwo', createdAt: 5001 })
    ])
    expect(orders).toHaveLength(2)
  })

  it('should group by timestamp proximity when no tx hash is present', () => {
    const orders = groupPurchases([
      record({ id: 'a', txHash: null, createdAt: 1_000_000 }),
      record({ id: 'b', txHash: null, createdAt: 1_000_500 }), // +0.5s → same cart
      record({ id: 'c', txHash: null, createdAt: 1_000_900 }) // +0.4s → chained into same cart
    ])
    expect(orders).toHaveLength(1)
    expect(orders[0].lines).toHaveLength(3)
  })

  it('should split hash-less purchases that are far apart in time', () => {
    const orders = groupPurchases([
      record({ createdAt: 2_000_000, txHash: null }),
      record({ createdAt: 1_000_000, txHash: null }) // ~17min earlier → different order
    ])
    expect(orders).toHaveLength(2)
  })

  it('should NOT merge a settled and a pending hash-less purchase even when close in time', () => {
    // A cart settles atomically, so its lines always share a status. Different statuses → different
    // orders, regardless of timestamp proximity.
    const orders = groupPurchases([
      record({ status: 'SETTLED', createdAt: 1_000_000, txHash: null }),
      record({ status: 'PENDING', createdAt: 1_000_500, txHash: null })
    ])
    expect(orders).toHaveLength(2)
  })

  it('should sort orders newest-first', () => {
    const orders = groupPurchases([
      record({ txHash: '0xold', createdAt: 1_000_000 }),
      record({ txHash: '0xnew', createdAt: 9_000_000 })
    ])
    expect(orders[0].id).toBe('0xnew')
    expect(orders[1].id).toBe('0xold')
  })

  it('should mark an order as PENDING when any line is still settling', () => {
    const orders = groupPurchases([
      record({ txHash: '0xc', status: 'SETTLED', createdAt: 5000 }),
      record({ txHash: '0xc', status: 'PENDING', createdAt: 5001 })
    ])
    expect(orders[0].status).toBe('PENDING')
  })
})

describe('when folding the display lines of an order', () => {
  it('should collapse repeated buys of the same item into one line with a quantity', () => {
    const items = foldOrderLines([
      record({ id: 'a', tradeId: 't1', credits: 10 }),
      record({ id: 'b', tradeId: 't1', credits: 10 }),
      record({ id: 'c', tradeId: 't2', credits: 5 })
    ])
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({ tradeId: 't1', quantity: 2, credits: 20 })
    expect(items[1]).toMatchObject({ tradeId: 't2', quantity: 1, credits: 5 })
  })

  it('should keep tradeId-less lines on their own rows', () => {
    const items = foldOrderLines([
      record({ id: 'a', tradeId: null, credits: 4 }),
      record({ id: 'b', tradeId: null, credits: 4 })
    ])
    expect(items).toHaveLength(2)
    expect(items.map(i => i.key)).toEqual(['a', 'b'])
  })
})
