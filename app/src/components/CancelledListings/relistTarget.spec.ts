import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('~/config', () => ({ config: { marketplaceUrl: 'https://market.example' } }))

import type { CancelledTrade } from '~/lib/cancelled-trades'
import { relistTargetFor, type RelistTarget } from './relistTarget'

type Input = Pick<CancelledTrade, 'type' | 'network' | 'asset'>

function input(type: CancelledTrade['type'], asset: Partial<CancelledTrade['asset']> = {}, network = 'MATIC'): Input {
  return {
    type,
    network,
    asset: { contractAddress: '0xc011', tokenId: null, itemId: null, name: null, image: null, ...asset }
  }
}

describe('when picking where a cancelled trade is put back up', () => {
  let trade: Input
  let secondarySales: boolean
  let target: RelistTarget | null

  beforeEach(() => {
    secondarySales = false
  })

  describe('and it was a listing of a creation', () => {
    beforeEach(() => {
      trade = input('public_item_order', { itemId: '3' })
      target = relistTargetFor(trade, { secondarySales })
    })

    it('should send the account to the item page in the Shop', () => {
      expect(target).toEqual({ kind: 'shop', to: '/item/0xc011/3' })
    })
  })

  describe('and it was a listing of a creation without an item id', () => {
    beforeEach(() => {
      trade = input('public_item_order')
      target = relistTargetFor(trade, { secondarySales })
    })

    it('should offer nowhere', () => {
      expect(target).toBeNull()
    })
  })

  describe('and it was a resale', () => {
    beforeEach(() => {
      trade = input('public_nft_order', { tokenId: '42' })
    })

    describe('and the Shop takes resales', () => {
      beforeEach(() => {
        secondarySales = true
        target = relistTargetFor(trade, { secondarySales })
      })

      it('should send the account to the token page in the Shop', () => {
        expect(target).toEqual({ kind: 'shop', to: '/token/0xc011/42' })
      })
    })

    describe('and the token is on Ethereum', () => {
      beforeEach(() => {
        trade = input('public_nft_order', { tokenId: '42' }, 'ETHEREUM')
        target = relistTargetFor(trade, { secondarySales: true })
      })

      it('should send the account to the token on the marketplace', () => {
        expect(target).toEqual({ kind: 'marketplace', href: 'https://market.example/contracts/0xc011/tokens/42' })
      })
    })

    describe('and the Shop does not take resales', () => {
      beforeEach(() => {
        target = relistTargetFor(trade, { secondarySales })
      })

      it('should send the account to the token on the marketplace', () => {
        expect(target).toEqual({ kind: 'marketplace', href: 'https://market.example/contracts/0xc011/tokens/42' })
      })
    })
  })

  describe('and it was a resale without a token id', () => {
    beforeEach(() => {
      trade = input('public_nft_order')
      target = relistTargetFor(trade, { secondarySales: true })
    })

    it('should offer nowhere', () => {
      expect(target).toBeNull()
    })
  })

  describe('and it was an offer on a token', () => {
    beforeEach(() => {
      trade = input('bid', { tokenId: '42' })
      target = relistTargetFor(trade, { secondarySales: true })
    })

    it('should send the account to the token on the marketplace', () => {
      expect(target).toEqual({ kind: 'marketplace', href: 'https://market.example/contracts/0xc011/tokens/42' })
    })
  })

  describe('and it was an offer on an item', () => {
    beforeEach(() => {
      trade = input('bid', { itemId: '3' })
      target = relistTargetFor(trade, { secondarySales })
    })

    it('should send the account to the item on the marketplace', () => {
      expect(target).toEqual({ kind: 'marketplace', href: 'https://market.example/contracts/0xc011/items/3' })
    })
  })

  describe('and it was an offer with neither id', () => {
    beforeEach(() => {
      trade = input('bid')
      target = relistTargetFor(trade, { secondarySales })
    })

    it('should offer nowhere', () => {
      expect(target).toBeNull()
    })
  })

  describe('and the asset has no collection', () => {
    beforeEach(() => {
      trade = input('public_item_order', { contractAddress: '', itemId: '3' })
      target = relistTargetFor(trade, { secondarySales })
    })

    it('should offer nowhere', () => {
      expect(target).toBeNull()
    })
  })
})
