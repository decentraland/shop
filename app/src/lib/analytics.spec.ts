import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ProviderType } from '@dcl/schemas'
import {
  track,
  trackPage,
  identify,
  reset,
  signInMethod,
  markAddressSeen,
  creditsToUsd,
  isPrimaryItem,
  itemProps,
  purchaseItemsProps,
  errorCode,
  isUserRejection
} from './analytics'
import { useWallet } from '~/store/wallet'
import type { CatalogItem } from '~/lib/api'

// The provider in main.tsx owns loading Segment; the wrapper only reads the instance back through
// @dcl/hooks, so that read is the seam these tests drive.
const segment = vi.hoisted(() => ({ current: null as Record<string, unknown> | null }))
vi.mock('@dcl/hooks', () => ({ getAnalytics: () => segment.current }))

const item = (over: Partial<CatalogItem> = {}): CatalogItem => ({
  id: 't1',
  name: 'X',
  creator: '0xcreator',
  contractAddress: '0xabc',
  itemId: '5',
  category: 'wearable',
  rarity: 'rare',
  network: 'MATIC',
  chainId: 80002,
  thumbnail: '',
  priceCredits: 20,
  gender: null,
  isSmart: false,
  ...over
})

beforeEach(() => {
  segment.current = null
  useWallet.setState({ session: null })
})

describe('analytics wrapper', () => {
  it('no-ops (never throws) when Segment is not loaded', () => {
    expect(() => track('Shop Viewed Item', { item_id: '5' })).not.toThrow()
    expect(() => identify('0xabc')).not.toThrow()
  })

  it('sends the event with the injected context when Segment is loaded', () => {
    const spy = vi.fn()
    segment.current = { track: spy, identify: vi.fn(), page: vi.fn() }
    useWallet.setState({ session: { address: '0xBUYER' } as never })

    track('Shop Viewed Item', { item_id: '5' })

    expect(spy).toHaveBeenCalledTimes(1)
    const [event, props] = spy.mock.calls[0]
    expect(event).toBe('Shop Viewed Item')
    expect(props).toMatchObject({
      item_id: '5',
      address: '0xBUYER',
      is_signed_in: true,
      network: 'amoy',
      app_env: 'dev'
    })
    expect(typeof props.session_id).toBe('string')
  })

  it('marks anonymous events with a null address / is_signed_in false', () => {
    const spy = vi.fn()
    segment.current = { track: spy, identify: vi.fn(), page: vi.fn() }
    track('Shop Viewed Page', { page: 'overview' })
    expect(spy.mock.calls[0][1]).toMatchObject({ address: null, is_signed_in: false })
  })

  it('reset drops the Segment identity when loaded, and never throws when it is not', () => {
    const spy = vi.fn()
    segment.current = {
      track: vi.fn(),
      identify: vi.fn(),
      page: vi.fn(),
      reset: spy
    }
    reset()
    expect(spy).toHaveBeenCalledTimes(1)

    segment.current = null
    expect(() => reset()).not.toThrow()
  })

  it('creditsToUsd: 1 credit = $0.10', () => {
    expect(creditsToUsd(20)).toBe(2)
    expect(creditsToUsd(19)).toBe(1.9)
    expect(creditsToUsd(0)).toBe(0)
  })

  it('isPrimaryItem: primary when there is no tokenId', () => {
    expect(isPrimaryItem({ itemId: '5', tokenId: undefined })).toBe(true)
    expect(isPrimaryItem({ itemId: null, tokenId: '9' })).toBe(false)
  })

  it('itemProps carries the public join keys + both prices', () => {
    const p = itemProps(item({ priceCredits: 20 }))
    expect(p).toMatchObject({
      item_id: '5',
      contract_address: '0xabc',
      price_credits: 20,
      price_usd: 2,
      is_primary: true
    })
  })

  it('purchaseItemsProps tags purchase_type explicitly and sums the value', () => {
    const p = purchaseItemsProps([
      item({ priceCredits: 20 }),
      item({ id: 't2', priceCredits: 19, itemId: null, tokenId: '9' })
    ])
    expect(p.value_credits).toBe(39)
    expect(p.value_usd).toBe(3.9)
    expect(p.purchase_type).toBe('item') // any primary in the cart → 'item'
    expect((p.items as unknown[]).length).toBe(2)
  })

  it('purchaseItemsProps → nft_resale when nothing is primary', () => {
    const p = purchaseItemsProps([item({ itemId: null, tokenId: '9' })])
    expect(p.purchase_type).toBe('nft_resale')
    expect(p.is_primary).toBe(false)
  })

  it('purchaseItemsProps counts the units an outfit contributed, so an outfit sale is countable', () => {
    const p = purchaseItemsProps([
      { ...item({ id: 'a' }), source: 'outfit', outfitId: 'fit-1' },
      { ...item({ id: 'b' }), source: 'outfit', outfitId: 'fit-1' },
      { ...item({ id: 'c' }), source: 'grid' }
    ])
    expect(p.units_from_outfit).toBe(2)
    expect(p.outfit_ids).toEqual(['fit-1'])
    const items = p.items as Array<{ source: string | null; outfit_id: string | null }>
    expect(items.map(i => i.source)).toEqual(['outfit', 'outfit', 'grid'])
    expect(items[2].outfit_id).toBeNull()
  })

  it('purchaseItemsProps dedupes and sorts outfit ids when a basket mixes two looks', () => {
    const p = purchaseItemsProps([
      { ...item({ id: 'a' }), source: 'outfit', outfitId: 'fit-b' },
      { ...item({ id: 'b' }), source: 'outfit', outfitId: 'fit-a' },
      { ...item({ id: 'c' }), source: 'outfit', outfitId: 'fit-b' }
    ])
    expect(p.outfit_ids).toEqual(['fit-a', 'fit-b'])
    expect(p.units_from_outfit).toBe(3)
  })

  it('purchaseItemsProps reports no outfit as null, not an empty array', () => {
    const p = purchaseItemsProps([item()])
    expect(p.outfit_ids).toBeNull()
    expect(p.units_from_outfit).toBe(0)
  })

  it('purchaseItemsProps carries per-item category so a basket can be split by asset type', () => {
    const p = purchaseItemsProps([item({ category: 'wearable', isSmart: true }), item({ id: 't2', category: 'emote' })])
    const items = p.items as Array<{ category: string; is_smart: boolean }>
    expect(items.map(i => i.category)).toEqual(['wearable', 'emote'])
    expect(items[0].is_smart).toBe(true)
    expect(items[1].is_smart).toBe(false)
  })

  it('itemProps carries category and is_smart', () => {
    const p = itemProps(item({ category: 'emote' }))
    expect(p.category).toBe('emote')
    expect(p.is_smart).toBe(false)
  })

  it('errorCode / isUserRejection bucket errors coarsely', () => {
    expect(errorCode({ code: 4001 })).toBe('user_rejected')
    expect(isUserRejection({ message: 'User denied the request' })).toBe(true)
    expect(errorCode({ message: 'insufficient credits' })).toBe('insufficient_credits')
    expect(errorCode({ message: 'boom' })).toBe('unknown')
    expect(isUserRejection({ message: 'boom' })).toBe(false)
  })

  it('trackPage never emits a Segment page call, the funnel keys on the Track event', () => {
    const track = vi.fn()
    const page = vi.fn()
    segment.current = { track, identify: vi.fn(), page }

    trackPage('overview')

    expect(track).toHaveBeenCalledWith('Shop Viewed Page', expect.objectContaining({ page: 'overview' }))
    expect(page).not.toHaveBeenCalled()
  })

  it('trackPage sends the Shop Viewed Page event with the page prop', () => {
    const spy = vi.fn()
    segment.current = { track: spy, identify: vi.fn(), page: vi.fn() }

    trackPage('overview')

    expect(spy).toHaveBeenCalledTimes(1)
    const [event, props] = spy.mock.calls[0]
    expect(event).toBe('Shop Viewed Page')
    expect(props).toMatchObject({ page: 'overview' })
  })

  it('identify lowercases the address when Segment is loaded', () => {
    const spy = vi.fn()
    segment.current = { track: vi.fn(), identify: spy, page: vi.fn() }

    identify('0xABCdef', { plan: 'free' })

    expect(spy).toHaveBeenCalledWith('0xabcdef', { plan: 'free' })
  })

  it('track swallows a store read that throws and still sends the event', () => {
    const spy = vi.fn()
    segment.current = { track: spy, identify: vi.fn(), page: vi.fn() }
    const getState = vi.spyOn(useWallet, 'getState').mockImplementation(() => {
      throw new Error('store exploded')
    })

    expect(() => track('Shop Viewed Item')).not.toThrow()
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0][1]).toMatchObject({ address: null, is_signed_in: false })

    getState.mockRestore()
  })

  it('errorCode buckets a not-for-sale listing failure', () => {
    expect(errorCode({ message: 'No active listing for this item' })).toBe('not_for_sale')
    expect(errorCode({ message: 'This NFT was already sold' })).toBe('not_for_sale')
    expect(errorCode({ message: 'Item not for sale' })).toBe('not_for_sale')
  })

  it('errorCode maps a wallet cancel message to user_rejected', () => {
    expect(errorCode({ message: 'Transaction cancelled by user' })).toBe('user_rejected')
    expect(errorCode({ message: 'MetaMask Tx Signature: User rejected' })).toBe('user_rejected')
  })

  it('errorCode returns unknown for null/undefined/plain errors', () => {
    expect(errorCode(null)).toBe('unknown')
    expect(errorCode(undefined)).toBe('unknown')
    expect(errorCode(new Error('something else'))).toBe('unknown')
  })
})

describe('signInMethod', () => {
  it('buckets Magic / Magic-test providers as magic', () => {
    expect(signInMethod(ProviderType.MAGIC)).toBe('magic')
    expect(signInMethod(ProviderType.MAGIC_TEST)).toBe('magic')
  })

  it('buckets any self-custody provider (or none) as wallet', () => {
    expect(signInMethod(ProviderType.INJECTED)).toBe('wallet')
    expect(signInMethod(null)).toBe('wallet')
    expect(signInMethod(undefined)).toBe('wallet')
  })
})

describe('markAddressSeen', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('returns true the first time an address is seen, false afterwards', () => {
    expect(markAddressSeen('0xNEWuser')).toBe(true)
    expect(markAddressSeen('0xNEWuser')).toBe(false)
  })

  it('is case-insensitive on the address', () => {
    expect(markAddressSeen('0xAbC')).toBe(true)
    expect(markAddressSeen('0xabc')).toBe(false)
  })

  it('returns false (best-effort) when localStorage throws', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled')
    })

    expect(markAddressSeen('0xdead')).toBe(false)

    getItem.mockRestore()
  })
})
