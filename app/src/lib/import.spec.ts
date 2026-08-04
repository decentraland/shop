import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Session } from '~/lib/auth'

vi.mock('~/config', () => ({
  config: { marketplaceServerUrl: 'http://server', chainId: 80002 }
}))

const postTrade = vi.fn()
const fetchTrade = vi.fn()
// Hoisted with the mock: vi.mock is lifted to the top of the file, so a plain top-level class would
// still be uninitialised when the factory runs.
const { TradeNotFound } = vi.hoisted(() => ({ TradeNotFound: class TradeNotFound extends Error {} }))
vi.mock('~/lib/api', () => ({
  postTrade: (...args: unknown[]) => postTrade(...args),
  fetchTrade: (...args: unknown[]) => fetchTrade(...args),
  TradeNotFoundError: TradeNotFound
}))

const cancelListing = vi.fn()
vi.mock('~/lib/buy', () => ({
  cancelListing: (...args: unknown[]) => cancelListing(...args)
}))

const readManaUsdRate = vi.fn()
const manaWeiToCredits = vi.fn()
const getIsSecondarySalesEnabled = vi.fn()
vi.mock('~/lib/featureFlags', () => ({
  getIsSecondarySalesEnabled: () => getIsSecondarySalesEnabled()
}))
vi.mock('~/lib/mana-rate', () => ({
  readManaUsdRate: (...args: unknown[]) => readManaUsdRate(...args),
  manaWeiToCredits: (...args: unknown[]) => manaWeiToCredits(...args)
}))

const ensureMinter = vi.fn()
const ensureApproval = vi.fn()
const createPrimaryUsdPeggedListing = vi.fn()
const createUsdPeggedListing = vi.fn()
vi.mock('~/lib/trades', () => ({
  ensureMinter: (...args: unknown[]) => ensureMinter(...args),
  ensureApproval: (...args: unknown[]) => ensureApproval(...args),
  createPrimaryUsdPeggedListing: (...args: unknown[]) => createPrimaryUsdPeggedListing(...args),
  createUsdPeggedListing: (...args: unknown[]) => createUsdPeggedListing(...args)
}))

import { fetchImportable, importListing, RelistFailedError, type ImportItem, type ImportListing } from '~/lib/import'

const listing = (over: Partial<ImportListing> = {}): ImportListing => ({
  oldTradeId: 'old-1',
  listingType: 'secondary',
  contractAddress: '0xcontract',
  itemId: null,
  tokenId: '5',
  name: 'Hat',
  thumbnail: 'http://thumb',
  rarity: 'rare',
  category: 'wearable',
  wearableCategory: 'hat',
  manaWei: '1000000000000000000',
  available: 1,
  network: 'MATIC',
  chainId: 137,
  ...over
})

const item = (over: Partial<ImportItem> = {}): ImportItem => ({
  ...listing(),
  suggestedCredits: 10,
  ...over
})

const session = { signer: { id: 'signer' }, identity: { id: 'identity' } } as unknown as Session

const okResponse = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ data }) })

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', vi.fn())
  // Secondary migration is what most cases below exercise, so default it ON — the case where the Shop
  // offers no resales has its own test.
  getIsSecondarySalesEnabled.mockResolvedValue(true)
  readManaUsdRate.mockResolvedValue({ rate: 1n, decimals: 8 })
  manaWeiToCredits.mockReturnValue(7)
  createPrimaryUsdPeggedListing.mockResolvedValue({ type: 'primary-trade' })
  createUsdPeggedListing.mockResolvedValue({ type: 'secondary-trade' })
  // Migrating cancels the old listing by default, so importListing fetches it first.
  fetchTrade.mockResolvedValue({ id: 'old-trade' })
})

describe("when fetching a seller's importable listings", () => {
  it('should query the marketplace server with a lowercased seller address', async () => {
    ;(fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(okResponse([]))

    await fetchImportable('0xABCdef')

    expect(fetch).toHaveBeenCalledWith('http://server/v3/catalog/importable?seller=0xabcdef')
  })

  it('should throw when the response is not ok', async () => {
    ;(fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({})
    })

    await expect(fetchImportable('0xseller')).rejects.toThrow('fetchImportable 503')
  })

  it('and there are no listings it should return empty buckets without reading the rate', async () => {
    ;(fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(okResponse([]))

    const result = await fetchImportable('0xseller')

    expect(result).toEqual({ creations: [], owned: [] })
    expect(readManaUsdRate).not.toHaveBeenCalled()
  })

  it('and data is null it should return empty buckets', async () => {
    ;(fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, status: 200, json: async () => ({}) })

    const result = await fetchImportable('0xseller')

    expect(result).toEqual({ creations: [], owned: [] })
  })

  it('should split listings into primary creations and secondary owned', async () => {
    ;(fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      okResponse([
        listing({ oldTradeId: 'a', listingType: 'primary' }),
        listing({ oldTradeId: 'b', listingType: 'secondary' }),
        listing({ oldTradeId: 'c', listingType: 'primary' })
      ])
    )

    const result = await fetchImportable('0xseller')

    expect(result.creations.map(i => i.oldTradeId)).toEqual(['a', 'c'])
    expect(result.owned.map(i => i.oldTradeId)).toEqual(['b'])
  })

  it('should read the rate on the chain of the first listing and attach suggestedCredits', async () => {
    ;(fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(okResponse([listing({ chainId: 1 })]))
    manaWeiToCredits.mockReturnValue(42)

    const result = await fetchImportable('0xseller')

    expect(readManaUsdRate).toHaveBeenCalledWith(1)
    expect(result.owned[0].suggestedCredits).toBe(42)
  })

  it('and the first listing has no chainId it should fall back to the configured chainId', async () => {
    ;(fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(okResponse([listing({ chainId: 0 })]))

    await fetchImportable('0xseller')

    expect(readManaUsdRate).toHaveBeenCalledWith(80002)
  })

  it('and the conversion returns null it should default suggestedCredits to 1', async () => {
    ;(fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(okResponse([listing()]))
    manaWeiToCredits.mockReturnValue(null)

    const result = await fetchImportable('0xseller')

    expect(result.owned[0].suggestedCredits).toBe(1)
  })
})

describe('when importing a primary (creation) listing', () => {
  it('should ensure the shop can mint then sign and post an item order', async () => {
    await importListing(item({ listingType: 'primary', itemId: '3', available: 5 }), 50, session)

    expect(ensureMinter).toHaveBeenCalledWith({ signer: session.signer, contractAddress: '0xcontract', chainId: 137 })
    expect(ensureApproval).not.toHaveBeenCalled()
    expect(createPrimaryUsdPeggedListing).toHaveBeenCalledTimes(1)
    expect(postTrade).toHaveBeenCalledWith({ type: 'primary-trade' }, session.identity)
  })

  it('should convert credits to USD at $0.10 per credit and forward supply and network', async () => {
    await importListing(item({ listingType: 'primary', itemId: '9', available: 3, network: 'MATIC' }), 50, session)

    const arg = createPrimaryUsdPeggedListing.mock.calls[0][0]
    expect(arg.usdPrice).toBe(5)
    expect(arg.uses).toBe(3)
    expect(arg.item).toMatchObject({ contractAddress: '0xcontract', itemId: '9', network: 'MATIC', chainId: 137 })
  })

  it('and itemId is null it should sign with an empty itemId', async () => {
    await importListing(item({ listingType: 'primary', itemId: null }), 10, session)

    expect(createPrimaryUsdPeggedListing.mock.calls[0][0].item.itemId).toBe('')
  })
})

// The back door this guard closes: the Sell action is hidden while resales are off, but this function is
// what SIGNS, and a listing signed here is indistinguishable from one signed by the Sell flow.
describe('when the Shop offers no secondary sales', () => {
  it('should refuse to migrate a secondary listing', async () => {
    getIsSecondarySalesEnabled.mockResolvedValue(false)

    await expect(importListing(item({ listingType: 'secondary', tokenId: '7' }), 20, session)).rejects.toThrow(
      /does not offer secondary sales/i
    )

    expect(createUsdPeggedListing).not.toHaveBeenCalled()
    // The refusal must land BEFORE the cancel — that is the only irreversible step here. Refusing after
    // it would leave the seller with their live listing taken down and nothing put back.
    expect(cancelListing).not.toHaveBeenCalled()
  })

  it('should still migrate a primary listing', async () => {
    // Primaries are unaffected — creators keep listing from their collections.
    getIsSecondarySalesEnabled.mockResolvedValue(false)

    await importListing(item({ listingType: 'primary', itemId: '3' }), 20, session)

    expect(createPrimaryUsdPeggedListing).toHaveBeenCalled()
  })
})

describe('when importing a secondary (owned) listing', () => {
  it('should ensure approval then sign and post an nft order', async () => {
    await importListing(item({ listingType: 'secondary', tokenId: '7' }), 20, session)

    expect(ensureApproval).toHaveBeenCalledWith({ signer: session.signer, contractAddress: '0xcontract', chainId: 137 })
    expect(ensureMinter).not.toHaveBeenCalled()
    expect(createUsdPeggedListing).toHaveBeenCalledTimes(1)
    expect(postTrade).toHaveBeenCalledWith({ type: 'secondary-trade' }, session.identity)
  })

  it('should convert credits to USD and forward the tokenId', async () => {
    await importListing(item({ listingType: 'secondary', tokenId: '7' }), 30, session)

    const arg = createUsdPeggedListing.mock.calls[0][0]
    expect(arg.usdPrice).toBe(3)
    expect(arg.nft).toMatchObject({ contractAddress: '0xcontract', tokenId: '7', network: 'MATIC', chainId: 137 })
  })

  it('and tokenId is null it should sign with an empty tokenId', async () => {
    await importListing(item({ listingType: 'secondary', tokenId: null }), 10, session)

    expect(createUsdPeggedListing.mock.calls[0][0].nft.tokenId).toBe('')
  })
})

describe('when migrating (taking the old listing down first)', () => {
  it('should fetch and cancel the old listing before posting the new trade', async () => {
    fetchTrade.mockResolvedValue({ id: 'old-1' })

    await importListing(item({ oldTradeId: 'old-1' }), 10, session)

    expect(fetchTrade).toHaveBeenCalledWith('old-1')
    expect(cancelListing).toHaveBeenCalledWith({ trade: { id: 'old-1' }, signer: session.signer })
    // Cancel MUST run before the re-list, or the marketplace 409s ("already an open order").
    expect(cancelListing.mock.invocationCallOrder[0]).toBeLessThan(postTrade.mock.invocationCallOrder[0])
  })

  /**
   * Narrowed from "cannot be fetched" to "is gone". It used to reject with a generic Error and still
   * expect the re-list to proceed, which is the defect it was pinning: any failure to ASK was read as
   * proof the listing was down, so a transient 500 skipped the cancel and every re-list then hit
   * `409 already an open order`. Only a 404 is evidence. The other branch is covered below.
   */
  it('and the old trade is genuinely gone (404) it should skip cancelling and still re-list', async () => {
    fetchTrade.mockRejectedValue(new TradeNotFound('gone'))

    await expect(importListing(item(), 10, session)).resolves.toBeUndefined()
    expect(cancelListing).not.toHaveBeenCalled()
    expect(postTrade).toHaveBeenCalledTimes(1)
  })

  it('and cancelOld is false it should leave the old listing untouched', async () => {
    await importListing(item(), 10, session, { cancelOld: false })

    expect(fetchTrade).not.toHaveBeenCalled()
    expect(cancelListing).not.toHaveBeenCalled()
    expect(postTrade).toHaveBeenCalledTimes(1)
  })

  it('throws RelistFailedError when re-listing fails AFTER the old listing was taken down', async () => {
    fetchTrade.mockResolvedValue({ id: 'old-1' })
    postTrade.mockRejectedValue(new Error('network down')) // not a "still on sale" conflict → no retry

    await expect(importListing(item({ oldTradeId: 'old-1' }), 10, session)).rejects.toBeInstanceOf(RelistFailedError)
    // The old listing WAS cancelled, so the item is now unlisted (won't reappear in Import).
    expect(cancelListing).toHaveBeenCalledTimes(1)
  })

  it('rethrows the original error when re-listing fails and nothing was cancelled', async () => {
    postTrade.mockRejectedValue(new Error('network down'))

    const err = await importListing(item(), 10, session, { cancelOld: false }).catch(e => e)
    expect(err).not.toBeInstanceOf(RelistFailedError)
    expect((err as Error).message).toBe('network down')
    expect(cancelListing).not.toHaveBeenCalled()
  })
})

describe('when the marketplace has not yet cleared the old order', () => {
  it('should retry the post until the "already an open order" conflict clears', async () => {
    vi.useFakeTimers()
    try {
      postTrade
        .mockRejectedValueOnce(new Error('There is already an open order for this NFT'))
        .mockRejectedValueOnce(new Error('There is already an open order for this NFT'))
        .mockResolvedValueOnce(undefined)

      const p = importListing(item(), 10, session)
      await vi.runAllTimersAsync()
      await expect(p).resolves.toBeUndefined()

      expect(postTrade).toHaveBeenCalledTimes(3)
    } finally {
      vi.useRealTimers()
    }
  })

  it('should rethrow other errors immediately without retrying', async () => {
    postTrade.mockRejectedValue(new Error('nope'))

    // cancelOld:false so the raw error isn't wrapped in RelistFailedError (nothing was taken down);
    // this isolates the retry policy — a non-conflict error is thrown after a single POST attempt.
    await expect(importListing(item(), 10, session, { cancelOld: false })).rejects.toThrow('nope')
    expect(postTrade).toHaveBeenCalledTimes(1)
  })
})

/**
 * WHAT `removedOld` IS ALLOWED TO MEAN.
 *
 * The migration takes the old MANA listing down and re-lists for credits. The take-down is the one
 * irreversible step, so the flow only tells the seller "your old listing was removed" when it really is.
 *
 * In production it said so wrongly: the gasless cancel resolved on a receipt it never checked, so a
 * transaction that mined and REVERTED read as success. Every re-list attempt then hit
 * `409 already an open order`, the tool hung, and the seller was told to re-list an item that was still
 * live in the old marketplace — a retry on that false premise could have listed it twice.
 */
describe('importListing take-down accounting', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    readManaUsdRate.mockResolvedValue({ rate: 50_000_000n, decimals: 8 })
    manaWeiToCredits.mockReturnValue(10)
    getIsSecondarySalesEnabled.mockResolvedValue(true)
    fetchTrade.mockResolvedValue({ id: 'old-1', chainId: 80002 })
    createPrimaryUsdPeggedListing.mockResolvedValue({ id: 'new-1' })
    postTrade.mockResolvedValue(undefined)
  })

  const run = (it: ImportItem) => importListing(it, 50, session)

  it('does NOT claim the listing was removed when the cancel fails', async () => {
    // A revert, or a wait that never confirms: either way the old listing may still be open, so the
    // error must be the cancel's own — never RelistFailedError, which tells the seller it came down.
    cancelListing.mockRejectedValue(new Error('the listing cancellation reverted on-chain'))

    const err = await run(item()).catch(e => e)

    expect(err).not.toBeInstanceOf(RelistFailedError)
    expect(err.message).toMatch(/cancel/i)
    // And it must not have gone on to re-list on top of a listing that may still be live.
    expect(postTrade).not.toHaveBeenCalled()
  })

  it('propagates any OTHER fetch failure instead of assuming the listing is gone', async () => {
    // The old code caught everything and treated it as "already gone", so a transient 500 skipped the
    // cancel and walked straight into the 409 loop.
    fetchTrade.mockRejectedValue(new Error('fetchTrade 500'))

    await expect(run(item())).rejects.toThrow(/500/)
    expect(cancelListing).not.toHaveBeenCalled()
    expect(postTrade).not.toHaveBeenCalled()
  })
})
