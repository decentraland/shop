import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the analytics module so we can assert the tracking side-effects without hitting Segment.
// creditsToUsd keeps its real behaviour (1 credit = $0.10) so cart_value_usd assertions are meaningful.
vi.mock('~/lib/analytics', () => ({
  track: vi.fn(),
  creditsToUsd: (credits: number) => Math.round(credits * 10) / 100
}))

import { useCart, type CartItem } from './cart'
import { track } from '~/lib/analytics'

const trackMock = vi.mocked(track)

// A cart line (CartItem = CatalogItem + quantity). Defaults to a primary line (itemId, no tokenId),
// quantity 1; override any field per test. add() ignores the seeded quantity (it manages its own).
const item = (over: Partial<CartItem> = {}): CartItem => ({
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
  isSmart: false,
  quantity: 1,
  ...over
})

beforeEach(() => {
  // The cart persists to localStorage; wipe it and reset every field (including the transient UI
  // ones) so a persisted snapshot never leaks into the next test.
  localStorage.clear()
  useCart.setState({ items: [], open: false, justAddedCount: 0, fittingOpen: false })
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

  it('and the same PRIMARY item is added again it should increment its quantity and track another add', () => {
    useCart.getState().add(item({ available: 100 }))
    trackMock.mockClear()
    useCart.setState({ open: false })

    useCart.getState().add(item({ available: 100 }))

    const state = useCart.getState()
    expect(state.items).toHaveLength(1)
    expect(state.items[0].quantity).toBe(2)
    expect(state.open).toBe(true)
    expect(trackMock).toHaveBeenCalledTimes(1)
  })

  it('and the same SECONDARY listing is added again it should stay at quantity 1 and not track', () => {
    useCart.getState().add(item({ itemId: null, tokenId: '9' }))
    trackMock.mockClear()
    useCart.setState({ open: false })

    useCart.getState().add(item({ itemId: null, tokenId: '9' }))

    const state = useCart.getState()
    expect(state.items).toHaveLength(1)
    expect(state.items[0].quantity).toBe(1)
    expect(state.open).toBe(true)
    expect(trackMock).not.toHaveBeenCalled()
  })

  it('should default a new line to quantity 1', () => {
    useCart.getState().add(item())
    expect(useCart.getState().items[0].quantity).toBe(1)
  })

  it('should not increment a PRIMARY line past its remaining stock (available)', () => {
    useCart.getState().add(item({ available: 2 }))
    useCart.getState().add(item({ available: 2 }))
    useCart.getState().add(item({ available: 2 })) // third add is a no-op at the cap
    expect(useCart.getState().items[0].quantity).toBe(2)
  })
})

describe('when changing a line quantity', () => {
  it('increment/decrement move a PRIMARY line within [1, stock]', () => {
    useCart.setState({ items: [{ ...item({ available: 3 }), quantity: 1 }] })

    useCart.getState().increment('t1')
    expect(useCart.getState().items[0].quantity).toBe(2)
    useCart.getState().increment('t1')
    useCart.getState().increment('t1') // capped at 3
    expect(useCart.getState().items[0].quantity).toBe(3)
    useCart.getState().decrement('t1')
    expect(useCart.getState().items[0].quantity).toBe(2)
  })

  it('decrement never drops below 1 (removal is a separate action)', () => {
    useCart.setState({ items: [{ ...item({ available: 3 }), quantity: 1 }] })
    useCart.getState().decrement('t1')
    expect(useCart.getState().items[0].quantity).toBe(1)
  })

  it('setQuantity clamps to [1, stock] and is a no-op for a SECONDARY line', () => {
    useCart.setState({ items: [{ ...item({ available: 5 }), quantity: 1 }] })
    useCart.getState().setQuantity('t1', 99)
    expect(useCart.getState().items[0].quantity).toBe(5)
    useCart.getState().setQuantity('t1', 0)
    expect(useCart.getState().items[0].quantity).toBe(1)

    useCart.setState({ items: [{ ...item({ itemId: null, tokenId: '9' }), quantity: 1 }] })
    useCart.getState().increment('t1')
    expect(useCart.getState().items[0].quantity).toBe(1) // secondary locked at 1
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

describe('when the cart is persisted to localStorage', () => {
  it('should write the items into dcl_shop_cart but never the transient UI fields', () => {
    useCart.getState().add(item({ id: 't1' }))

    const raw = localStorage.getItem('dcl_shop_cart')
    expect(raw).toBeTruthy()
    const persisted = JSON.parse(raw as string)

    // zustand-persist envelope: { state, version }. partialize keeps only `items`.
    expect(persisted.version).toBe(2)
    expect(Object.keys(persisted.state)).toEqual(['items'])
    expect(persisted.state.items).toHaveLength(1)
    expect(persisted.state.items[0].id).toBe('t1')
    expect(persisted.state.items[0].quantity).toBe(1)
    // A reload must not reopen the drawer or re-show the "N added" banner.
    expect(persisted.state).not.toHaveProperty('open')
    expect(persisted.state).not.toHaveProperty('justAddedCount')
    expect(persisted.state).not.toHaveProperty('fittingOpen')
  })

  it('should rehydrate a legacy (v1, no quantity) snapshot and migrate every line to quantity 1', async () => {
    // A cart persisted before quantity existed: version 1, items with no `quantity` field.
    localStorage.setItem('dcl_shop_cart', JSON.stringify({ state: { items: [item({ id: 'seed' })] }, version: 1 }))

    // Simulate a page reload: reset the module registry and re-import so the store is created from
    // scratch and hydrates from the seeded snapshot (localStorage is synchronous).
    vi.resetModules()
    const { useCart: freshCart } = await import('./cart')
    await freshCart.persist.rehydrate()

    const state = freshCart.getState()
    expect(state.items).toHaveLength(1)
    expect(state.items[0].id).toBe('seed')
    // The migration defaults a missing quantity to 1 so totals/steppers never see `undefined`.
    expect(state.items[0].quantity).toBe(1)
    // Transient UI is NOT restored — it comes from the initializer defaults, not from storage.
    expect(state.open).toBe(false)
    expect(state.justAddedCount).toBe(0)
    expect(state.fittingOpen).toBe(false)
  })

  it('should empty the persisted snapshot when the cart is cleared', () => {
    useCart.getState().add(item({ id: 't1' }))
    expect(JSON.parse(localStorage.getItem('dcl_shop_cart') as string).state.items).toHaveLength(1)

    useCart.getState().clear()

    expect(useCart.getState().items).toEqual([])
    expect(JSON.parse(localStorage.getItem('dcl_shop_cart') as string).state.items).toEqual([])
  })
})
