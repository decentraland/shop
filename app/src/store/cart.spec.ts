import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { CatalogItem } from '~/lib/api'

// Mock the analytics module so we can assert the tracking side-effects without hitting Segment.
// creditsToUsd keeps its real behaviour (1 credit = $0.10) so cart_value_usd assertions are meaningful.
vi.mock('~/lib/analytics', () => ({
  track: vi.fn(),
  creditsToUsd: (credits: number) => Math.round(credits * 10) / 100
}))

import { useCart } from './cart'
import { track } from '~/lib/analytics'

const trackMock = vi.mocked(track)

const item = (over: Partial<CatalogItem> = {}): CatalogItem => ({
  id: 't1',
  name: 'Hat',
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
  useCart.setState({ items: [], open: false })
  trackMock.mockClear()
})

describe('when adding an item to the cart', () => {
  it('should append the item, open the popover and track the add', () => {
    useCart.getState().add(item())

    const state = useCart.getState()
    expect(state.items).toHaveLength(1)
    expect(state.items[0].id).toBe('t1')
    expect(state.open).toBe(true)
    expect(trackMock).toHaveBeenCalledTimes(1)
  })

  it('should send the funnel props with both prices, primary flag and cart snapshot', () => {
    useCart.getState().add(item({ priceCredits: 20 }), 'item_detail')

    const [event, props] = trackMock.mock.calls[0]
    expect(event).toBe('Shop Added To Cart')
    expect(props).toMatchObject({
      item_id: '5',
      contract_address: '0xabc',
      price_credits: 20,
      price_usd: 2,
      is_primary: true,
      source: 'item_detail',
      cart_size: 1,
      cart_value_usd: 2
    })
  })

  it('should default the source to grid when none is given', () => {
    useCart.getState().add(item())
    expect(trackMock.mock.calls[0][1]).toMatchObject({ source: 'grid' })
  })

  it('should mark a secondary listing (has tokenId) as not primary and null item_id', () => {
    useCart.getState().add(item({ itemId: null, tokenId: '9' }))
    expect(trackMock.mock.calls[0][1]).toMatchObject({ is_primary: false, item_id: null })
  })

  it('and a second distinct item is added it should sum the cart value across items', () => {
    useCart.getState().add(item({ id: 't1', priceCredits: 20 }))
    useCart.getState().add(item({ id: 't2', contractAddress: '0xdef', priceCredits: 19 }))

    const state = useCart.getState()
    expect(state.items).toHaveLength(2)
    expect(trackMock).toHaveBeenCalledTimes(2)
    // 20 + 19 = 39 credits => $3.90
    expect(trackMock.mock.calls[1][1]).toMatchObject({ cart_size: 2, cart_value_usd: 3.9 })
  })

  it('and the same item is added again it should open the popover but not duplicate or track', () => {
    useCart.getState().add(item())
    trackMock.mockClear()
    useCart.setState({ open: false })

    useCart.getState().add(item())

    const state = useCart.getState()
    expect(state.items).toHaveLength(1)
    expect(state.open).toBe(true)
    expect(trackMock).not.toHaveBeenCalled()
  })
})

describe('when removing an item from the cart', () => {
  it('should drop the item and track the removal with the new cart size', () => {
    useCart.setState({ items: [item({ id: 't1' }), item({ id: 't2', contractAddress: '0xdef' })] })
    trackMock.mockClear()

    useCart.getState().remove('t1')

    const state = useCart.getState()
    expect(state.items.map(i => i.id)).toEqual(['t2'])
    expect(trackMock).toHaveBeenCalledTimes(1)
    const [event, props] = trackMock.mock.calls[0]
    expect(event).toBe('Shop Removed From Cart')
    expect(props).toMatchObject({ item_id: '5', cart_size: 1 })
  })

  it('and the id is not in the cart it should be a no-op and not track', () => {
    useCart.setState({ items: [item({ id: 't1' })] })
    trackMock.mockClear()

    useCart.getState().remove('nope')

    expect(useCart.getState().items).toHaveLength(1)
    expect(trackMock).not.toHaveBeenCalled()
  })

  it('should carry a null item_id when the removed item is a secondary listing', () => {
    useCart.setState({ items: [item({ id: 't1', itemId: null, tokenId: '9' })] })
    trackMock.mockClear()

    useCart.getState().remove('t1')

    expect(trackMock.mock.calls[0][1]).toMatchObject({ item_id: null, cart_size: 0 })
  })
})

describe('when clearing the cart', () => {
  it('should empty the items without tracking', () => {
    useCart.setState({ items: [item({ id: 't1' }), item({ id: 't2', contractAddress: '0xdef' })], open: true })
    trackMock.mockClear()

    useCart.getState().clear()

    expect(useCart.getState().items).toEqual([])
    expect(trackMock).not.toHaveBeenCalled()
  })

  it('should leave the open flag untouched', () => {
    useCart.setState({ items: [item()], open: true })
    useCart.getState().clear()
    expect(useCart.getState().open).toBe(true)
  })
})

describe('when toggling the popover', () => {
  it('should set open to true', () => {
    useCart.getState().setOpen(true)
    expect(useCart.getState().open).toBe(true)
  })

  it('should set open to false', () => {
    useCart.setState({ open: true })
    useCart.getState().setOpen(false)
    expect(useCart.getState().open).toBe(false)
  })

  it('should not touch the items when toggling', () => {
    useCart.setState({ items: [item()] })
    useCart.getState().setOpen(true)
    expect(useCart.getState().items).toHaveLength(1)
  })
})
