import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Session } from '~/lib/auth'

vi.mock('~/config', () => ({
  config: { marketplaceServerUrl: 'http://server', chainId: 80002 }
}))

const postTrade = vi.fn()
const fetchTrade = vi.fn()
vi.mock('~/lib/api', () => ({
  postTrade: (...args: unknown[]) => postTrade(...args),
  fetchTrade: (...args: unknown[]) => fetchTrade(...args)
}))

const cancelListing = vi.fn()
vi.mock('~/lib/buy', () => ({
  cancelListing: (...args: unknown[]) => cancelListing(...args)
}))

const readManaUsdRate = vi.fn()
const manaWeiToCredits = vi.fn()
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

// eslint-disable-next-line import/first
import { fetchImportable, importListing, type ImportItem, type ImportListing } from '~/lib/import'

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
  readManaUsdRate.mockResolvedValue({ rate: 1n, decimals: 8 })
  manaWeiToCredits.mockReturnValue(7)
  createPrimaryUsdPeggedListing.mockResolvedValue({ type: 'primary-trade' })
  createUsdPeggedListing.mockResolvedValue({ type: 'secondary-trade' })
  // Migrating cancels the old listing by default, so importListing fetches it first.
  fetchTrade.mockResolvedValue({ id: 'old-trade' })
})

describe('when fetching a seller\'s importable listings', () => {
  it('should query the marketplace server with a lowercased seller address', async () => {
    ;(fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(okResponse([]))

    await fetchImportable('0xABCdef')

    expect(fetch).toHaveBeenCalledWith('http://server/v3/catalog/importable?seller=0xabcdef')
  })

  it('should throw when the response is not ok', async () => {
    ;(fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 503, json: async () => ({}) })

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

  it('and the old trade cannot be fetched it should skip cancelling and still re-list', async () => {
    fetchTrade.mockRejectedValue(new Error('gone'))

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

    await expect(importListing(item(), 10, session)).rejects.toThrow('nope')
    expect(postTrade).toHaveBeenCalledTimes(1)
  })
})
