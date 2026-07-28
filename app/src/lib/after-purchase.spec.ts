import { describe, it, expect, vi } from 'vitest'
import type { QueryClient } from '@tanstack/react-query'
import { invalidateAfterPurchase } from '~/lib/after-purchase'

function fakeQc() {
  const calls: unknown[][] = []
  const qc = {
    invalidateQueries: vi.fn((arg: { queryKey: unknown[] }) => {
      calls.push(arg.queryKey)
      return Promise.resolve()
    })
  } as unknown as QueryClient
  return { qc, keys: () => calls.map(k => k[0] as string), all: () => calls }
}

// The point of this spec is drift: this list lived twice (Buy Now + cart checkout) and adding a key meant
// remembering both call sites. Pinning the set means a future addition has to be made here, once, and any
// accidental REMOVAL fails loudly instead of going stale in silence.
const EXPECTED = [
  'usd-balance',
  'detail-trade',
  'shop-item',
  'owned-token',
  'public-token',
  'item-resales',
  'shop-items',
  'catalog-items',
  'overview-listings',
  'upsell-listings',
  'my-assets',
  'purchases',
  'owned-item-count'
]

describe('invalidateAfterPurchase', () => {
  it('invalidates every key a settled purchase makes stale', () => {
    const { qc, keys } = fakeQc()
    invalidateAfterPurchase(qc)
    expect(keys().sort()).toEqual([...EXPECTED].sort())
  })

  it('scopes the per-item keys when exactly one item was bought', () => {
    const { qc, all } = fakeQc()
    invalidateAfterPurchase(qc, { contractAddress: '0xabc', tokenId: '7', itemId: '1' })
    expect(all()).toContainEqual(['owned-token', '0xabc', '7'])
    expect(all()).toContainEqual(['public-token', '0xabc', '7'])
    expect(all()).toContainEqual(['item-resales', '0xabc', '1'])
  })

  it('leaves the per-item keys BROAD for a basket, which spans many items', () => {
    const { qc, all } = fakeQc()
    invalidateAfterPurchase(qc)
    expect(all()).toContainEqual(['owned-token'])
    expect(all()).toContainEqual(['public-token'])
    expect(all()).toContainEqual(['item-resales'])
  })

  it('refreshes the balance, because credits were just spent', () => {
    const { qc, all } = fakeQc()
    invalidateAfterPurchase(qc)
    expect(all()).toContainEqual(['usd-balance'])
  })
})
