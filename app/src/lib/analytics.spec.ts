import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ProviderType } from '@dcl/schemas'
import {
  track,
  trackPage,
  identify,
  signInMethod,
  markAddressSeen,
  creditsToUsd,
  isPrimaryItem,
  itemProps,
  purchaseItemsProps,
  errorCode,
  isUserRejection,
  initAnalytics
} from './analytics'
import { useWallet } from '~/store/wallet'
import type { CatalogItem } from '~/lib/api'

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
  ...over
})

beforeEach(() => {
  ;(window as unknown as { analytics?: unknown }).analytics = undefined
  useWallet.setState({ session: null })
})

describe('analytics wrapper', () => {
  it('no-ops (never throws) when Segment is not loaded', () => {
    expect(() => track('Shop Viewed Item', { item_id: '5' })).not.toThrow()
    expect(() => identify('0xabc')).not.toThrow()
  })

  it('sends the event with the injected context when Segment is loaded', () => {
    const spy = vi.fn()
    ;(window as unknown as { analytics?: unknown }).analytics = { track: spy, identify: vi.fn(), page: vi.fn() }
    useWallet.setState({ session: { address: '0xBUYER' } as never })

    track('Shop Viewed Item', { item_id: '5' })

    expect(spy).toHaveBeenCalledTimes(1)
    const [event, props] = spy.mock.calls[0]
    expect(event).toBe('Shop Viewed Item')
    expect(props).toMatchObject({ item_id: '5', address: '0xBUYER', is_signed_in: true, network: 'amoy', app_env: 'dev' })
    expect(typeof props.session_id).toBe('string')
  })

  it('marks anonymous events with a null address / is_signed_in false', () => {
    const spy = vi.fn()
    ;(window as unknown as { analytics?: unknown }).analytics = { track: spy, identify: vi.fn(), page: vi.fn() }
    track('Shop Viewed Page', { page: 'overview' })
    expect(spy.mock.calls[0][1]).toMatchObject({ address: null, is_signed_in: false })
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

  it('errorCode / isUserRejection bucket errors coarsely', () => {
    expect(errorCode({ code: 4001 })).toBe('user_rejected')
    expect(isUserRejection({ message: 'User denied the request' })).toBe(true)
    expect(errorCode({ message: 'insufficient credits' })).toBe('insufficient_credits')
    expect(errorCode({ message: 'boom' })).toBe('unknown')
    expect(isUserRejection({ message: 'boom' })).toBe(false)
  })

  it('trackPage sends the Shop Viewed Page event with the page prop', () => {
    const spy = vi.fn()
    ;(window as unknown as { analytics?: unknown }).analytics = { track: spy, identify: vi.fn(), page: vi.fn() }

    trackPage('overview')

    expect(spy).toHaveBeenCalledTimes(1)
    const [event, props] = spy.mock.calls[0]
    expect(event).toBe('Shop Viewed Page')
    expect(props).toMatchObject({ page: 'overview' })
  })

  it('identify lowercases the address when Segment is loaded', () => {
    const spy = vi.fn()
    ;(window as unknown as { analytics?: unknown }).analytics = { track: vi.fn(), identify: spy, page: vi.fn() }

    identify('0xABCdef', { plan: 'free' })

    expect(spy).toHaveBeenCalledWith('0xabcdef', { plan: 'free' })
  })

  it('track swallows a store read that throws and still sends the event', () => {
    const spy = vi.fn()
    ;(window as unknown as { analytics?: unknown }).analytics = { track: spy, identify: vi.fn(), page: vi.fn() }
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

describe('initAnalytics', () => {
  it('no-ops when no Segment write key is configured (test env)', () => {
    const appendChild = vi.spyOn(document.head, 'appendChild')

    expect(() => initAnalytics()).not.toThrow()
    // With an empty VITE_SEGMENT_WRITE_KEY the loader never runs → no analytics stub, no script.
    expect((window as unknown as { analytics?: unknown }).analytics).toBeUndefined()
    expect(appendChild).not.toHaveBeenCalled()

    appendChild.mockRestore()
  })

  it('is idempotent — a second call is still a no-op', () => {
    const appendChild = vi.spyOn(document.head, 'appendChild')

    initAnalytics()
    initAnalytics()

    expect(appendChild).not.toHaveBeenCalled()
    appendChild.mockRestore()
  })
})
