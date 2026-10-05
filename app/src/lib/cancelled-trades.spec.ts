import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AuthIdentity } from '@dcl/crypto'

const { signedFetch } = vi.hoisted(() => ({ signedFetch: vi.fn() }))
vi.mock('decentraland-crypto-fetch', () => ({ default: signedFetch }))
vi.mock('~/config', () => ({ config: { marketplaceServerUrl: 'https://marketplace.example' } }))

import {
  cancelledTradeCredits,
  cancelledTradesKind,
  fetchCancelledTrades,
  type CancelledTrade
} from '~/lib/cancelled-trades'
import type { ManaRate } from '~/lib/mana-convert'

const IDENTITY = {} as AuthIdentity
// 1 MANA = $0.50 → 10 MANA = 50 credits.
const RATE: ManaRate = { rate: 50_000_000n, decimals: 8 }

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

describe('when fetching the cancelled trades', () => {
  let result: CancelledTrade[] | undefined
  let error: unknown

  beforeEach(() => {
    signedFetch.mockReset()
    result = undefined
    error = undefined
  })

  describe('and the server answers', () => {
    beforeEach(async () => {
      signedFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ data: [trade()], total: 1 }) })
      result = await fetchCancelledTrades(IDENTITY)
    })

    it('should ask for the signature-index bump reason with a signed request', () => {
      expect(signedFetch).toHaveBeenCalledWith(
        'https://marketplace.example/v1/cancelled-trades?reason=contract_signature_index_bump&first=100',
        { method: 'GET', identity: IDENTITY, metadata: { signer: 'dcl:marketplace' } }
      )
    })

    it('should return the rows', () => {
      expect(result).toEqual([trade()])
    })
  })

  describe('and the server answers without data', () => {
    beforeEach(async () => {
      signedFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) })
      result = await fetchCancelledTrades(IDENTITY)
    })

    it('should return an empty list', () => {
      expect(result).toEqual([])
    })
  })

  describe('and the server fails', () => {
    let cancel: ReturnType<typeof vi.fn>

    beforeEach(async () => {
      cancel = vi.fn()
      signedFetch.mockResolvedValueOnce({ ok: false, status: 401, body: { cancel } })
      error = await fetchCancelledTrades(IDENTITY).catch(e => e)
    })

    it('should throw with the status', () => {
      expect((error as Error).message).toBe('fetchCancelledTrades 401')
    })

    it('should release the unread body', () => {
      expect(cancel).toHaveBeenCalledTimes(1)
    })
  })
})

describe('when pricing a cancelled trade in credits', () => {
  let input: CancelledTrade
  let rate: ManaRate | undefined

  beforeEach(() => {
    rate = RATE
  })

  describe('and it was priced in dollars', () => {
    beforeEach(() => {
      input = trade({ price: { assetType: 2, amount: '2500000000000000000' } })
    })

    it('should convert the dollars at the fixed credit rate', () => {
      expect(cancelledTradeCredits(input, rate)).toBe(25)
    })
  })

  describe('and it was priced in the classic currency', () => {
    beforeEach(() => {
      input = trade({ price: { assetType: 1, amount: '10000000000000000000' } })
    })

    it('should convert at the live rate', () => {
      expect(cancelledTradeCredits(input, rate)).toBe(50)
    })

    describe('and the rate is not known yet', () => {
      beforeEach(() => {
        rate = undefined
      })

      it('should return null', () => {
        expect(cancelledTradeCredits(input, rate)).toBeNull()
      })
    })
  })

  describe('and it carries no price', () => {
    beforeEach(() => {
      input = trade({ price: null })
    })

    it('should return null', () => {
      expect(cancelledTradeCredits(input, rate)).toBeNull()
    })
  })

  describe('and the dollar amount is malformed', () => {
    beforeEach(() => {
      input = trade({ price: { assetType: 2, amount: 'nope' } })
    })

    it('should return null', () => {
      expect(cancelledTradeCredits(input, rate)).toBeNull()
    })
  })

  describe('and the price is in an asset the Shop does not price', () => {
    beforeEach(() => {
      input = trade({ price: { assetType: 3, amount: '1' } })
    })

    it('should return null', () => {
      expect(cancelledTradeCredits(input, rate)).toBeNull()
    })
  })
})

describe('when classifying a set of cancelled trades', () => {
  let trades: CancelledTrade[]

  describe('and none are offers', () => {
    beforeEach(() => {
      trades = [trade(), trade({ type: 'public_nft_order' })]
    })

    it('should call them listings', () => {
      expect(cancelledTradesKind(trades)).toBe('listings')
    })
  })

  describe('and all are offers', () => {
    beforeEach(() => {
      trades = [trade({ type: 'bid' }), trade({ type: 'bid' })]
    })

    it('should call them offers', () => {
      expect(cancelledTradesKind(trades)).toBe('offers')
    })
  })

  describe('and some are offers', () => {
    beforeEach(() => {
      trades = [trade(), trade({ type: 'bid' })]
    })

    it('should call them mixed', () => {
      expect(cancelledTradesKind(trades)).toBe('mixed')
    })
  })
})
