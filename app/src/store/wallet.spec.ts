import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Session } from '~/lib/auth'

// All wallet I/O goes through ~/lib/auth (wallet connect/redirect/restore/logout) and
// ~/lib/analytics (Segment funnel). Mock both inline so the store's reducer logic is what's under test.
const logout = vi.fn(async () => {})
const restoreSession = vi.fn(async (): Promise<Session | null> => null)
const signInRedirect = vi.fn(() => {})

vi.mock('~/lib/auth', () => ({
  logout: () => logout(),
  restoreSession: () => restoreSession(),
  signInRedirect: () => signInRedirect()
}))

const track = vi.fn()
const identify = vi.fn()
const signInMethod = vi.fn((_providerType?: unknown) => 'wallet')
const markAddressSeen = vi.fn((_address: string) => true)

vi.mock('~/lib/analytics', () => ({
  track: (...args: unknown[]) => track(...args),
  identify: (...args: unknown[]) => identify(...args),
  signInMethod: (providerType?: unknown) => signInMethod(providerType),
  markAddressSeen: (address: string) => markAddressSeen(address)
}))

// eslint-disable-next-line import/first
import { useWallet } from '~/store/wallet'

const SIGNING_IN_FLAG = 'shop:signing_in'

const session = (over: Partial<Session> = {}): Session =>
  ({ address: '0xBUYER', providerType: 'injected', chainId: 80002, ...over }) as unknown as Session

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
  useWallet.setState({ session: null, connecting: false, error: null })
  // reset the customizable mock return values clearAllMocks wiped
  restoreSession.mockResolvedValue(null)
  signInMethod.mockReturnValue('wallet')
  markAddressSeen.mockReturnValue(true)
})

describe('wallet store', () => {
  describe('signIn', () => {
    it('sets the signing-in flag and redirects to the auth app', () => {
      useWallet.getState().signIn()

      expect(sessionStorage.getItem(SIGNING_IN_FLAG)).toBe('1')
      expect(signInRedirect).toHaveBeenCalledTimes(1)
    })

    it('still redirects when sessionStorage throws (flag write fails)', () => {
      const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('storage disabled')
      })

      expect(() => useWallet.getState().signIn()).not.toThrow()
      expect(signInRedirect).toHaveBeenCalledTimes(1)

      spy.mockRestore()
    })
  })

  describe('disconnect', () => {
    it('tracks the sign-out, calls logout, and clears the session', async () => {
      useWallet.setState({ session: session() })

      await useWallet.getState().disconnect()

      expect(track).toHaveBeenCalledWith('Shop Signed Out')
      expect(logout).toHaveBeenCalledTimes(1)
      expect(useWallet.getState().session).toBeNull()
    })
  })

  describe('restore', () => {
    it('no-ops when there is no previous session (no state change, no analytics)', async () => {
      restoreSession.mockResolvedValue(null)

      await useWallet.getState().restore()

      expect(useWallet.getState().session).toBeNull()
      expect(identify).not.toHaveBeenCalled()
      expect(track).not.toHaveBeenCalled()
    })

    it('stores the session and identifies on a silent restore, without emitting the sign-in event', async () => {
      const s = session({ address: '0xABC', providerType: 'magic' as unknown as Session['providerType'] })
      restoreSession.mockResolvedValue(s)
      signInMethod.mockReturnValue('magic')

      await useWallet.getState().restore()

      expect(useWallet.getState().session).toBe(s)
      expect(identify).toHaveBeenCalledWith('0xABC', { sign_in_method: 'magic' })
      // no flag set → this is a restore, not a fresh sign-in
      expect(track).not.toHaveBeenCalled()
    })

    it('emits the sign-in funnel event and consumes the flag on a fresh sign-in', async () => {
      sessionStorage.setItem(SIGNING_IN_FLAG, '1')
      const s = session({ address: '0xNEW' })
      restoreSession.mockResolvedValue(s)
      signInMethod.mockReturnValue('wallet')
      markAddressSeen.mockReturnValue(true)

      await useWallet.getState().restore()

      expect(track).toHaveBeenCalledWith('Shop Signed In', { method: 'wallet', is_new_user: true })
      expect(markAddressSeen).toHaveBeenCalledWith('0xNEW')
      // flag is consumed so a later reload doesn't re-fire the event
      expect(sessionStorage.getItem(SIGNING_IN_FLAG)).toBeNull()
    })

    it('passes is_new_user:false through from markAddressSeen for a returning address', async () => {
      sessionStorage.setItem(SIGNING_IN_FLAG, '1')
      restoreSession.mockResolvedValue(session())
      markAddressSeen.mockReturnValue(false)

      await useWallet.getState().restore()

      expect(track).toHaveBeenCalledWith('Shop Signed In', { method: 'wallet', is_new_user: false })
    })

    it('still stores the session and skips the sign-in event when sessionStorage reads throw', async () => {
      const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('storage disabled')
      })
      const s = session()
      restoreSession.mockResolvedValue(s)

      await expect(useWallet.getState().restore()).resolves.toBeUndefined()

      expect(useWallet.getState().session).toBe(s)
      expect(identify).toHaveBeenCalledTimes(1)
      expect(track).not.toHaveBeenCalled()

      spy.mockRestore()
    })
  })
})
