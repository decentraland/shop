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
  useCart.setState({ items: [], owner: null, open: false, justAddedCount: 0, fittingOpen: false })
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

  it('should stamp the source and outfit id on the line, so the purchase event can name them', () => {
    useCart.getState().add(item(), 'outfit', 'fit-1')
    expect(useCart.getState().items[0]).toMatchObject({ source: 'outfit', outfitId: 'fit-1' })
  })

  it('should keep the first source when a primary line is added again (first touch wins)', () => {
    useCart.getState().add(item(), 'outfit', 'fit-1')
    useCart.getState().add(item(), 'grid')

    const [line] = useCart.getState().items
    expect(line.quantity).toBe(2)
    expect(line).toMatchObject({ source: 'outfit', outfitId: 'fit-1' })
  })

  it('should leave outfitId unset for a line that did not come from an outfit', () => {
    useCart.getState().add(item(), 'grid')
    expect(useCart.getState().items[0].outfitId).toBeUndefined()
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

// The bug this guards, seen in production: three different CollectionStore mints were added from one
// outfit and became a SINGLE line at quantity 3. Mints carry no tradeId, the feed mapper took that
// null as the row id, and `find(i => i.id === item.id)` matched null against null — so the buyer paid
// for three copies of whichever landed first and never received the other two. Lines are told apart
// by `id`, so distinct products must arrive with distinct ids (see listingRowId in lib/api).
describe('when adding several store mints, which carry no trade id', () => {
  it('should keep each mint on its own line rather than raising one line to quantity 3', () => {
    const mints = [
      item({ id: '0xaaa-1', contractAddress: '0xaaa', itemId: '1', name: 'Yoga Outfit', tradeId: undefined }),
      item({ id: '0xbbb-0', contractAddress: '0xbbb', itemId: '0', name: 'Broken Chain', tradeId: undefined }),
      item({ id: '0xccc-0', contractAddress: '0xccc', itemId: '0', name: "DASH ELite's", tradeId: undefined })
    ]

    mints.forEach(mint => useCart.getState().add(mint, 'outfit'))

    const { items } = useCart.getState()
    expect(items).toHaveLength(3)
    expect(items.map(i => i.name)).toEqual(['Yoga Outfit', 'Broken Chain', "DASH ELite's"])
    expect(items.every(i => i.quantity === 1)).toBe(true)
  })

  // The flip side: the SAME mint added twice is still one line at quantity 2, because a mint can
  // legitimately be bought in multiples.
  it('should still stack the same mint added twice', () => {
    const mint = item({ id: '0xaaa-1', contractAddress: '0xaaa', itemId: '1', tradeId: undefined, available: 10 })

    useCart.getState().add(mint, 'outfit')
    useCart.getState().add(mint, 'outfit')

    const { items } = useCart.getState()
    expect(items).toHaveLength(1)
    expect(items[0].quantity).toBe(2)
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

  it('decrement at quantity 1 removes the line and tracks it as a removal', () => {
    useCart.setState({ items: [{ ...item({ available: 3 }), quantity: 1 }] })
    trackMock.mockClear()

    useCart.getState().decrement('t1')

    expect(useCart.getState().items).toHaveLength(0)
    expect(trackMock).toHaveBeenCalledTimes(1)
    expect(trackMock.mock.calls[0][0]).toBe('Shop Removed From Cart')
  })

  it('decrement removes a SECONDARY line too (it lives at quantity 1)', () => {
    useCart.setState({ items: [{ ...item({ itemId: null, tokenId: '9' }), quantity: 1 }] })
    useCart.getState().decrement('t1')
    expect(useCart.getState().items).toHaveLength(0)
  })

  it('decrement on an id not in the cart is a no-op', () => {
    useCart.setState({ items: [{ ...item(), quantity: 2 }] })
    trackMock.mockClear()

    useCart.getState().decrement('nope')

    expect(useCart.getState().items[0].quantity).toBe(2)
    expect(trackMock).not.toHaveBeenCalled()
  })

  it('setQuantity clamps values >= 1 to [1, stock] and locks a SECONDARY line at 1', () => {
    useCart.setState({ items: [{ ...item({ available: 5 }), quantity: 1 }] })
    useCart.getState().setQuantity('t1', 99)
    expect(useCart.getState().items[0].quantity).toBe(5)
    useCart.getState().setQuantity('t1', 1)
    expect(useCart.getState().items[0].quantity).toBe(1)

    useCart.setState({ items: [{ ...item({ itemId: null, tokenId: '9' }), quantity: 1 }] })
    useCart.getState().setQuantity('t1', 3)
    useCart.getState().increment('t1')
    expect(useCart.getState().items[0].quantity).toBe(1) // secondary locked at 1
  })

  it('setQuantity to zero (or below) removes the line', () => {
    useCart.setState({ items: [{ ...item({ available: 5 }), quantity: 3 }] })
    trackMock.mockClear()

    useCart.getState().setQuantity('t1', 0)

    expect(useCart.getState().items).toHaveLength(0)
    expect(trackMock.mock.calls[0][0]).toBe('Shop Removed From Cart')

    useCart.setState({ items: [{ ...item({ available: 5 }), quantity: 3 }] })
    useCart.getState().setQuantity('t1', -2)
    expect(useCart.getState().items).toHaveLength(0)
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

    // zustand-persist envelope: { state, version }. partialize keeps only `items` + `owner`.
    expect(persisted.version).toBe(2)
    expect(Object.keys(persisted.state)).toEqual(['items', 'owner'])
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

/**
 * WHOSE cart this is.
 *
 * The cart persists under one global localStorage key, and the account-switch handler reloads the page rather
 * than purging stores — so account B used to rehydrate account A's cart and could check it out. `reloadFor`
 * is the session boundary: the wallet store calls it on every restore and sign-out.
 */
describe('when a session claims the cart', () => {
  const A = '0xAAAA000000000000000000000000000000000001'
  const B = '0xbbbb000000000000000000000000000000000002'

  it('should empty the cart when a DIFFERENT account signs in', () => {
    useCart.getState().reloadFor(A)
    useCart.getState().add(item())
    expect(useCart.getState().items).toHaveLength(1)

    useCart.getState().reloadFor(B)

    expect(useCart.getState().items).toEqual([])
    expect(useCart.getState().owner).toBe(B.toLowerCase())
    // The wipe must reach storage too, or the next reload brings the old cart straight back.
    expect(JSON.parse(localStorage.getItem('dcl_shop_cart') as string).state.items).toEqual([])
  })

  it('should keep the cart when the SAME account is restored, whatever the casing', () => {
    useCart.getState().reloadFor(A.toLowerCase())
    useCart.getState().add(item())

    useCart.getState().reloadFor(A)

    expect(useCart.getState().items).toHaveLength(1)
  })

  it('should adopt an unclaimed cart, so items added before signing in survive the sign-in', () => {
    // The real flow: browse signed out, add to cart, and checkout asks for a sign-in.
    useCart.getState().add(item())
    expect(useCart.getState().owner).toBeNull()

    useCart.getState().reloadFor(A)

    expect(useCart.getState().items).toHaveLength(1)
    expect(useCart.getState().owner).toBe(A.toLowerCase())
  })

  it('should still empty an ADOPTED cart when the account then switches', () => {
    // Reported: add signed out, sign in (adopted — correct), then switch accounts and the items were
    // still there. Adoption has to leave a real owner behind, not a cart that any account can claim.
    useCart.getState().add(item())
    useCart.getState().reloadFor(A)

    useCart.getState().reloadFor(B)

    expect(useCart.getState().items).toEqual([])
    expect(useCart.getState().owner).toBe(B.toLowerCase())
  })

  it('should keep the items AND the owner tag on sign-out', () => {
    useCart.getState().reloadFor(A)
    useCart.getState().add(item())

    useCart.getState().reloadFor(null)

    // Signing out is not switching accounts — the same buyer coming back finds their cart. Keeping the tag
    // is what makes the NEXT buyer's sign-in a switch rather than an adoption.
    expect(useCart.getState().items).toHaveLength(1)
    expect(useCart.getState().owner).toBe(A.toLowerCase())
  })

  it('should empty the cart for a different account that signs in after a sign-out', () => {
    useCart.getState().reloadFor(A)
    useCart.getState().add(item())
    useCart.getState().reloadFor(null)

    useCart.getState().reloadFor(B)

    expect(useCart.getState().items).toEqual([])
  })

  it('should close the fitting room when the cart changes hands', () => {
    useCart.getState().reloadFor(A)
    useCart.setState({ items: [item()], fittingOpen: true })

    useCart.getState().reloadFor(B)

    expect(useCart.getState().fittingOpen).toBe(false)
  })

  it('should hand a cart persisted before owners existed to the first account that signs in', () => {
    localStorage.setItem('dcl_shop_cart', JSON.stringify({ state: { items: [item({ id: 'seed' })] }, version: 2 }))

    vi.resetModules()
    return import('./cart').then(async ({ useCart: freshCart }) => {
      await freshCart.persist.rehydrate()
      expect(freshCart.getState().owner).toBeNull()

      freshCart.getState().reloadFor(A)

      // Nobody's cart is not somebody else's cart: the buyer keeps what they had before the upgrade.
      expect(freshCart.getState().items).toHaveLength(1)
      expect(freshCart.getState().owner).toBe(A.toLowerCase())
    })
  })
})

/**
 * The fitting room shows the CART, so an empty cart leaves it with nothing to render — and, before this, it
 * stayed open behind the empty state. Removing the last line there, going back to browse and adding
 * something reopened the modal on top of the grid, because `add` raises the cart drawer and never lowered
 * this. Reported as "it leaves the fitting room in an invalid state".
 */
describe('the fitting room and an emptying cart', () => {
  it('should close the fitting room when the last line is removed', () => {
    useCart.setState({ items: [item()], fittingOpen: true, open: false })
    useCart.getState().remove('t1')
    expect(useCart.getState().items).toEqual([])
    expect(useCart.getState().fittingOpen).toBe(false)
  })

  it('should keep the fitting room open while any line survives', () => {
    useCart.setState({ items: [item(), item({ id: 't2' })], fittingOpen: true, open: false })
    useCart.getState().remove('t1')
    expect(useCart.getState().fittingOpen).toBe(true)
  })

  it('should close the fitting room on clear()', () => {
    useCart.setState({ items: [item()], fittingOpen: true, open: false })
    useCart.getState().clear()
    expect(useCart.getState().fittingOpen).toBe(false)
  })

  it('should never leave the fitting room open over the page an add came from', () => {
    useCart.setState({ items: [], fittingOpen: true, open: false })
    useCart.getState().add(item(), 'grid')
    expect(useCart.getState().fittingOpen).toBe(false)
    // The drawer is what an add raises.
    expect(useCart.getState().open).toBe(true)
  })
})

/**
 * THE "N ITEMS ADDED" BANNER.
 *
 * `justAddedCount` is what the drawer's green success message counts, and only `setOpen` ever reset it.
 * So removing the line it had just announced left the banner asserting the add over an empty cart, and
 * because `add` resumes from the current value while the drawer is open, the next add carried the dead
 * count forward: add four, delete them all, add one, and the banner claimed five.
 */
describe('when the cart is emptied after an add', () => {
  it('should stop announcing an add once the line it announced is removed', () => {
    useCart.getState().add(item({ id: 'a' }))
    expect(useCart.getState().justAddedCount).toBe(1)

    useCart.getState().remove('a')

    expect(useCart.getState().items).toHaveLength(0)
    expect(useCart.getState().justAddedCount).toBe(0)
  })

  it('should not carry the old count into the next add', () => {
    const store = useCart.getState()
    ;['a', 'b', 'c', 'd'].forEach(id => store.add(item({ id })))
    expect(useCart.getState().justAddedCount).toBe(4)
    ;['a', 'b', 'c', 'd'].forEach(id => useCart.getState().remove(id))

    useCart.getState().add(item({ id: 'e' }))

    // One add since the cart was emptied — not five.
    expect(useCart.getState().justAddedCount).toBe(1)
  })

  it('should reset the count when the cart is cleared outright', () => {
    useCart.getState().add(item({ id: 'a' }))

    useCart.getState().clear()

    expect(useCart.getState().justAddedCount).toBe(0)
  })

  it('should stop announcing an add when one of several lines is removed, since the count is now wrong', () => {
    useCart.getState().add(item({ id: 'a' }))
    useCart.getState().add(item({ id: 'b' }))
    expect(useCart.getState().justAddedCount).toBe(2)

    useCart.getState().remove('a')

    expect(useCart.getState().items).toHaveLength(1)
    expect(useCart.getState().justAddedCount).toBe(0)
  })
})
