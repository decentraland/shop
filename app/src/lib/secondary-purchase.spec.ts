import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TradeAssetType, type Trade } from '@dcl/schemas'

import { assertSecondaryPurchasesAllowed, isSecondaryItem, isSecondaryTrade } from '~/lib/secondary-purchase'
import { resetFeatureFlagsCache } from '~/lib/featureFlags'

/**
 * THE RESALE KILL SWITCH, AT THE LAST STEP BEFORE MONEY MOVES.
 *
 * Hiding a CTA is not a switch. A cart persisted to localStorage while the Shop was selling resales, a
 * `/token/…` deep link, a checkout resumed after a Stripe top-up and a stale react-query snapshot all
 * carry a resale past the render that would have hidden it — so the purchase rails ask again, here, and
 * refuse.
 *
 * Judged from the SIGNED TRADE and not from the cart line: `tokenId` is display data, `sent` is what the
 * contract moves.
 */

const flagResponse = (flags: Record<string, boolean>) =>
  vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ flags }) })

const resale = (over: Partial<Trade> = {}): Trade =>
  ({
    id: 'trade-resale',
    signer: '0xseller',
    sent: [{ assetType: TradeAssetType.ERC721, contractAddress: '0xcollection', tokenId: '77' }],
    received: [{ assetType: TradeAssetType.ERC20, contractAddress: '0xmana', amount: '1000' }],
    ...over
  }) as unknown as Trade

const mint = (over: Partial<Trade> = {}): Trade =>
  ({
    id: 'trade-mint',
    signer: '0xcreator',
    sent: [{ assetType: TradeAssetType.COLLECTION_ITEM, contractAddress: '0xcollection', itemId: '3' }],
    received: [{ assetType: TradeAssetType.USD_PEGGED_MANA, contractAddress: '0xmana', amount: '1000' }],
    ...over
  }) as unknown as Trade

beforeEach(() => {
  resetFeatureFlagsCache()
})
afterEach(() => {
  vi.unstubAllGlobals()
  resetFeatureFlagsCache()
})

describe('isSecondaryTrade', () => {
  it('should call a trade that sends an existing token a resale', () => {
    expect(isSecondaryTrade(resale())).toBe(true)
  })

  it('should not call a trade that mints a fresh copy a resale', () => {
    expect(isSecondaryTrade(mint())).toBe(false)
  })

  it('should read the asset type numerically, as the schema serialises it over the wire', () => {
    // A trade arriving from the API carries plain numbers, not enum members.
    expect(isSecondaryTrade({ sent: [{ assetType: 3 }] } as unknown as Trade)).toBe(true)
    expect(isSecondaryTrade({ sent: [{ assetType: 4 }] } as unknown as Trade)).toBe(false)
  })

  it('should treat a trade with a token among several sent assets as a resale', () => {
    const mixed = resale({
      sent: [
        { assetType: TradeAssetType.COLLECTION_ITEM, contractAddress: '0xc', itemId: '1' },
        { assetType: TradeAssetType.ERC721, contractAddress: '0xc', tokenId: '9' }
      ]
    } as Partial<Trade>)
    expect(isSecondaryTrade(mixed)).toBe(true)
  })

  it('should not throw on a malformed trade with no sent assets', () => {
    expect(isSecondaryTrade({} as unknown as Trade)).toBe(false)
  })
})

describe('isSecondaryItem', () => {
  it('should call a row scoped to one token a resale', () => {
    expect(isSecondaryItem({ tokenId: '77' })).toBe(true)
  })

  it('should not call a row with no token a resale', () => {
    expect(isSecondaryItem({})).toBe(false)
    expect(isSecondaryItem({ tokenId: null })).toBe(false)
  })
})

describe('assertSecondaryPurchasesAllowed', () => {
  it('should refuse a resale while the Shop is not selling them', async () => {
    vi.stubGlobal('fetch', flagResponse({}))

    await expect(assertSecondaryPurchasesAllowed([resale()])).rejects.toThrow(/resales/i)
  })

  it('should allow a resale once the purchase flag is on', async () => {
    vi.stubGlobal('fetch', flagResponse({ 'dapps-shop-secondary-purchases': true }))

    await expect(assertSecondaryPurchasesAllowed([resale()])).resolves.toBeUndefined()
  })

  it('should allow a resale on the older sales flag too', async () => {
    vi.stubGlobal('fetch', flagResponse({ 'dapps-shop-secondary-sales': true }))

    await expect(assertSecondaryPurchasesAllowed([resale()])).resolves.toBeUndefined()
  })

  it('should refuse when the flag service is unreachable', async () => {
    // Fail CLOSED. An outage must not be a window in which resales become buyable.
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))

    await expect(assertSecondaryPurchasesAllowed([resale()])).rejects.toThrow(/resales/i)
  })

  it('should let a MINT through without consulting the flag at all', async () => {
    const fetchMock = flagResponse({})
    vi.stubGlobal('fetch', fetchMock)

    await expect(assertSecondaryPurchasesAllowed([mint()])).resolves.toBeUndefined()
    // Primary sales are untouched by this permission, and a flag read here would put the flag service on
    // the critical path of every ordinary purchase.
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('should let an empty batch through', async () => {
    const fetchMock = flagResponse({})
    vi.stubGlobal('fetch', fetchMock)

    await expect(assertSecondaryPurchasesAllowed([])).resolves.toBeUndefined()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('should refuse a MIXED batch whole rather than settling the primary half', async () => {
    vi.stubGlobal('fetch', flagResponse({}))

    // A mixed basket signs once per group. Letting the mint settle and then refusing would charge the
    // buyer for part of an order they placed as one.
    await expect(assertSecondaryPurchasesAllowed([mint(), resale()])).rejects.toThrow(/resales/i)
  })

  it('should word the refusal so the shared error mapper cannot read it as a sold-out item', async () => {
    vi.stubGlobal('fetch', flagResponse({}))

    const message = await assertSecondaryPurchasesAllowed([resale()]).then(
      () => '',
      (e: Error) => e.message
    )
    // lib/errors matches these patterns to say "just sold or removed" / "you cancelled" — neither is true
    // here, and both would send the buyer back to try again on something that will never work.
    expect(message).not.toMatch(/not for sale|not found|no active listing|404/i)
    expect(message).not.toMatch(/reject|denied|cancel/i)
    expect(message).not.toMatch(/insufficient/i)
  })
})
