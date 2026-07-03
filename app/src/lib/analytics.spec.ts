import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  track,
  identify,
  creditsToUsd,
  isPrimaryItem,
  itemProps,
  purchaseItemsProps,
  errorCode,
  isUserRejection
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
})
