import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { ProviderType } from '@dcl/schemas'
import type { Session } from '~/lib/auth'

/**
 * Switching accounts is handled with a full page reload rather than a surgical purge — except for the CART,
 * which a reload RESTORES rather than clears, because it is persisted to localStorage.
 *
 * The reported bug: add items signed out, sign in as A (the cart is adopted, correctly), then switch to B —
 * and B still had A's items. `restoreSession` reports no session at all for an account with no stored
 * identity on this device, so `wallet.restore` returns before it ever reaches the cart's session boundary.
 * The switch itself is the only moment we know both that an account changed and which one to.
 */
const reloadFor = vi.fn()
vi.mock('~/store/cart', () => ({ useCart: { getState: () => ({ reloadFor }) } }))

const A = '0xaaaa000000000000000000000000000000000001'
const B = '0xbbbb000000000000000000000000000000000002'

// The EIP-1193 listener the hook registers, captured so tests can fire accountsChanged themselves.
let listener: ((...args: unknown[]) => void) | undefined
const provider = {
  on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
    if (event === 'accountsChanged') listener = cb
  }),
  removeListener: vi.fn()
}

const session = (over: Partial<Session> = {}): Session =>
  ({
    address: A,
    providerType: ProviderType.INJECTED,
    web3Provider: { provider },
    ...over
  }) as unknown as Session

const walletState: { session: Session | null } = { session: session() }
vi.mock('~/store/wallet', () => ({
  useWallet: (sel?: (s: unknown) => unknown) => (typeof sel === 'function' ? sel(walletState) : walletState)
}))

const { useAccountWatcher } = await import('~/hooks/useAccountWatcher')

const reload = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  listener = undefined
  walletState.session = session()
  // jsdom's location.reload is not implemented; the hook only ever calls it.
  Object.defineProperty(window, 'location', { value: { reload }, writable: true })
})

describe('when the wallet switches to a different account', () => {
  it('should hand the cart to the new account, before the reload that would restore it', () => {
    renderHook(() => useAccountWatcher())
    listener?.([B])

    // Ordering matters: the cart write has to be persisted before the page goes away.
    expect(reloadFor).toHaveBeenCalledWith(B)
    expect(reloadFor.mock.invocationCallOrder[0]).toBeLessThan(reload.mock.invocationCallOrder[0])
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('should pass the address even when that account has no stored identity here', () => {
    // THE bug: this is the case where the restore on the other side reports no session, so nothing
    // downstream would ever tell the cart the buyer changed. Nothing about the event says whether an
    // identity exists, which is exactly why the hand-over cannot be deferred to the restore.
    renderHook(() => useAccountWatcher())
    listener?.([B.toUpperCase()])

    expect(reloadFor).toHaveBeenCalledWith(B)
  })
})

describe('when the wallet re-emits the same account', () => {
  it('should leave both the cart and the page alone', () => {
    renderHook(() => useAccountWatcher())
    listener?.([A.toUpperCase()])

    expect(reloadFor).not.toHaveBeenCalled()
    expect(reload).not.toHaveBeenCalled()
  })
})

describe('when the wallet disconnects every account', () => {
  it('should reload without emptying the cart, which is the sign-out policy', () => {
    renderHook(() => useAccountWatcher())
    listener?.([])

    // reloadFor(null) is a deliberate no-op in the store: the same buyer coming back finds their cart, and
    // a DIFFERENT buyer signing in still trips the switch case.
    expect(reloadFor).toHaveBeenCalledWith(null)
    expect(reload).toHaveBeenCalledTimes(1)
  })
})

describe('when the session is not an injected wallet', () => {
  it('should not subscribe at all, since only injected wallets emit accountsChanged', () => {
    walletState.session = session({ providerType: ProviderType.MAGIC })
    renderHook(() => useAccountWatcher())

    expect(provider.on).not.toHaveBeenCalled()
  })
})
