import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, cleanup, waitFor, act } from '@testing-library/react'
import type { Session } from '~/lib/auth'
import { intercomData } from './IntercomLauncher'

const OWNER_KEY = 'shop:intercom_wallet'

function setReadyState(state: DocumentReadyState) {
  Object.defineProperty(document, 'readyState', { configurable: true, get: () => state })
}

const session = (address: string) => ({ address, providerType: 'injected' }) as unknown as Session

const settle = () => new Promise(resolve => setTimeout(resolve, 30))

describe('intercomData', () => {
  it('sends the signed-in account lowercased, with the sign-in method', () => {
    expect(intercomData({ address: '0xABCdef', providerType: 'injected' })).toEqual({
      Wallet: '0xabcdef',
      'Wallet type': 'injected'
    })
  })

  it('omits the account entirely when signed out, rather than sending a null over a known value', () => {
    expect(intercomData({ address: null, providerType: null })).toEqual({})
    expect(intercomData({})).toEqual({})
  })

  it('stitches the conversation to the analytics identity through the anonymous id', () => {
    expect(intercomData({ anonId: 'anon-1' })).toEqual({ anon_id: 'anon-1' })
    expect(intercomData({ address: '0xabc', anonId: 'anon-1' })).toEqual({ Wallet: '0xabc', anon_id: 'anon-1' })
  })
})

// Runs the real dapps widget against a stubbed `window.Intercom`, so the order of the commands Intercom
// receives is the one production sends.
describe('Intercom', () => {
  let anonId: string | undefined
  let client: ReturnType<typeof vi.fn<(command: string, payload?: Record<string, unknown>) => void>>
  // The module reset gives the component its own copy of the store, so the spec has to drive that one.
  let setSession: (session: Session | null) => void

  const commands = () => client.mock.calls.map(call => call[0])
  const updates = () => client.mock.calls.filter(call => call[0] === 'update').map(call => call[1])

  beforeEach(() => {
    anonId = 'anon-1'
    client = vi.fn()
    ;(window as unknown as { Intercom?: unknown }).Intercom = client
    localStorage.clear()
  })

  afterEach(() => {
    cleanup()
    vi.doUnmock('~/config')
    vi.doUnmock('~/lib/analytics')
    vi.resetModules()
    setReadyState('complete')
    ;(window as unknown as { Intercom?: unknown }).Intercom = undefined
    localStorage.clear()
  })

  async function renderWith(
    intercomAppId: string,
    { restored = true, signedIn = null as Session | null }: { restored?: boolean; signedIn?: Session | null } = {}
  ) {
    vi.resetModules()
    vi.doMock('~/config', () => ({ config: { intercomAppId, chainId: 80002, segmentWriteKey: '' } }))
    vi.doMock('~/lib/analytics', () => ({
      anonymousId: () => anonId,
      // Like Segment's `ready`: asynchronous, and only once there is an id to read.
      onAnalyticsReady: (callback: () => void) => {
        const poll = () => void setTimeout(() => (anonId ? callback() : poll()), 0)
        poll()
      }
    }))
    const { useWallet } = await import('~/store/wallet')
    useWallet.setState({ session: signedIn, restored })
    setSession = next => act(() => useWallet.setState({ session: next, restored: true }))
    const { Intercom } = await import('./Intercom')
    render(<Intercom />)
  }

  it('does not start the support widget when no app id is configured', async () => {
    await renderWith('')
    await settle()
    expect(client).not.toHaveBeenCalled()
  })

  it('starts the support widget with the configured app id once the page is idle', async () => {
    await renderWith('app-123')
    await waitFor(() => expect(updates()).toContainEqual({ app_id: 'app-123', anon_id: 'anon-1' }))
    expect(commands()).not.toContain('shutdown')
  })

  it('holds the support widget back while the page is still loading', async () => {
    setReadyState('loading')
    await renderWith('app-123')
    await settle()
    expect(client).not.toHaveBeenCalled()

    window.dispatchEvent(new Event('load'))
    await waitFor(() => expect(commands()).toContain('update'))
  })

  it('never starts the support widget on a phone', async () => {
    const userAgent = navigator.userAgent
    Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'Mozilla/5.0 (iPhone) Mobile/15E148' })
    try {
      await renderWith('app-123')
      await settle()
      expect(client).not.toHaveBeenCalled()
      expect(document.querySelector('script[src*="intercom"]')).toBeNull()
    } finally {
      Object.defineProperty(navigator, 'userAgent', { configurable: true, value: userAgent })
    }
  })

  it('keeps the anonymous id when analytics becomes ready while a stale session is being ended', async () => {
    localStorage.setItem(OWNER_KEY, '0xaaa')
    anonId = undefined
    ;(window as unknown as { Intercom?: unknown }).Intercom = undefined
    await renderWith('app-123')
    // The restart has read a missing id and is now waiting on Intercom's script.
    const script = await waitFor(() => {
      const node = document.querySelector('script[src*="intercom"]')
      expect(node).not.toBeNull()
      return node
    })

    anonId = 'anon-1'
    await settle()
    ;(window as unknown as { Intercom?: unknown }).Intercom = client
    script?.dispatchEvent(new Event('load'))

    await waitFor(() => expect(updates().at(-1)).toEqual({ app_id: 'app-123', anon_id: 'anon-1' }))
  })

  it('holds the support widget back until the session is known', async () => {
    localStorage.setItem(OWNER_KEY, '0xaaa')
    await renderWith('app-123', { restored: false })
    await settle()
    expect(client).not.toHaveBeenCalled()
  })

  describe('when a visitor signs in', () => {
    it('attaches the account to the running support session and remembers it', async () => {
      await renderWith('app-123')
      await waitFor(() => expect(commands()).toContain('update'))

      setSession(session('0xABC'))

      await waitFor(() => expect(updates().at(-1)).toMatchObject({ Wallet: '0xabc', 'Wallet type': 'injected' }))
      expect(commands()).not.toContain('shutdown')
      expect(localStorage.getItem(OWNER_KEY)).toBe('0xabc')
    })
  })

  describe('when the account signs out', () => {
    it('starts an empty support session under the new anonymous id', async () => {
      await renderWith('app-123', { signedIn: session('0xABC') })
      await waitFor(() => expect(updates().at(-1)).toMatchObject({ Wallet: '0xabc', anon_id: 'anon-1' }))
      client.mockClear()

      anonId = 'anon-2'
      setSession(null)

      await waitFor(() => expect(updates().at(-1)).toEqual({ app_id: 'app-123', anon_id: 'anon-2' }))
      const boot = commands().lastIndexOf('boot')
      expect(commands().lastIndexOf('shutdown')).toBeLessThan(boot)
      expect(client.mock.calls[boot][1]).toEqual({ app_id: 'app-123', alignment: 'right', anon_id: 'anon-2' })
      // Nothing the signed-out account owned reaches the new session.
      for (const [, payload] of client.mock.calls.slice(boot)) {
        expect(payload ?? {}).not.toHaveProperty('Wallet')
        expect(payload ?? {}).not.toMatchObject({ anon_id: 'anon-1' })
      }
      expect(localStorage.getItem(OWNER_KEY)).toBeNull()
    })
  })

  describe('when the page loads with a support session left by another account', () => {
    beforeEach(() => {
      localStorage.setItem(OWNER_KEY, '0xaaa')
    })

    it('ends that session before sending anything about the account now signed in', async () => {
      await renderWith('app-123', { signedIn: session('0xBBB') })

      await waitFor(() => expect(updates().at(-1)).toMatchObject({ Wallet: '0xbbb' }))
      expect(commands().slice(0, 2)).toEqual(['shutdown', 'boot'])
      expect(client.mock.calls[1][1]).toMatchObject({ app_id: 'app-123', Wallet: '0xbbb' })
      expect(localStorage.getItem(OWNER_KEY)).toBe('0xbbb')
    })

    it('ends that session for a visitor who is signed out', async () => {
      await renderWith('app-123')

      await waitFor(() => expect(commands()).toContain('update'))
      expect(commands().slice(0, 2)).toEqual(['shutdown', 'boot'])
      expect(client.mock.calls[1][1]).not.toHaveProperty('Wallet')
      expect(localStorage.getItem(OWNER_KEY)).toBeNull()
    })

    it('keeps the session when the same account comes back', async () => {
      await renderWith('app-123', { signedIn: session('0xAAA') })

      await waitFor(() => expect(updates().at(-1)).toMatchObject({ Wallet: '0xaaa' }))
      expect(commands()).not.toContain('shutdown')
    })
  })
})
