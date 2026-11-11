import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, cleanup, waitFor, act } from '@testing-library/react'
import type { Session } from '~/lib/auth'
import { intercomData } from './IntercomLauncher'

type WidgetProps = { appId: string; data: Record<string, string> }

function setReadyState(state: DocumentReadyState) {
  Object.defineProperty(document, 'readyState', { configurable: true, get: () => state })
}

function setIntercom(client: unknown) {
  ;(window as unknown as { Intercom?: unknown }).Intercom = client
}

afterEach(() => {
  cleanup()
  vi.doUnmock('~/config')
  vi.doUnmock('~/lib/analytics')
  vi.doUnmock('decentraland-dapps/dist/components/Intercom')
  vi.resetModules()
  setReadyState('complete')
  setIntercom(undefined)
})

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

describe('Intercom', () => {
  let anonId: string
  // The module reset gives the component its own copy of the store, so the spec has to drive that one.
  let setSession: (session: Session | null) => void

  beforeEach(() => {
    anonId = 'anon-1'
  })

  async function renderWith(intercomAppId: string) {
    const widget = vi.fn((_props: WidgetProps) => null)
    vi.resetModules()
    vi.doMock('~/config', () => ({ config: { intercomAppId, chainId: 80002, segmentWriteKey: '' } }))
    vi.doMock('~/lib/analytics', () => ({
      anonymousId: () => anonId,
      onAnalyticsReady: (callback: () => void) => callback()
    }))
    vi.doMock('decentraland-dapps/dist/components/Intercom', () => ({ default: widget }))
    const { useWallet } = await import('~/store/wallet')
    setSession = session => act(() => useWallet.setState({ session }))
    const { Intercom } = await import('./Intercom')
    render(<Intercom />)
    return widget
  }

  const lastData = (widget: { mock: { calls: [WidgetProps][] } }) => widget.mock.calls.at(-1)?.[0].data

  const signIn = (address: string) => setSession({ address, providerType: 'injected' } as unknown as Session)

  it('does not mount the support widget when no app id is configured', async () => {
    const widget = await renderWith('')
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(widget).not.toHaveBeenCalled()
  })

  it('mounts the support widget with the configured app id once the page is idle', async () => {
    const widget = await renderWith('app-123')
    await waitFor(() => expect(widget).toHaveBeenCalled())
    expect(widget.mock.calls[0][0]).toMatchObject({ appId: 'app-123' })
  })

  it('holds the support widget back while the page is still loading', async () => {
    setReadyState('loading')
    const widget = await renderWith('app-123')
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(widget).not.toHaveBeenCalled()

    window.dispatchEvent(new Event('load'))
    await waitFor(() => expect(widget).toHaveBeenCalled())
  })

  describe('when the account signs out', () => {
    it('starts a fresh support session, so the next visitor does not inherit the conversation', async () => {
      const client = vi.fn()
      setIntercom(client)
      const widget = await renderWith('app-123')
      await waitFor(() => expect(widget).toHaveBeenCalled())
      signIn('0xABC')
      await waitFor(() => expect(lastData(widget)).toMatchObject({ Wallet: '0xabc' }))
      expect(client).not.toHaveBeenCalled()

      anonId = 'anon-2'
      setSession(null)

      await waitFor(() => expect(client).toHaveBeenCalledWith('shutdown'))
      expect(client).toHaveBeenLastCalledWith('boot', { app_id: 'app-123', alignment: 'right', anon_id: 'anon-2' })
    })

    it('sends the new anonymous id instead of the signed-out one', async () => {
      const widget = await renderWith('app-123')
      await waitFor(() => expect(lastData(widget)).toEqual({ anon_id: 'anon-1' }))
      signIn('0xABC')

      anonId = 'anon-2'
      setSession(null)

      await waitFor(() => expect(lastData(widget)).toEqual({ anon_id: 'anon-2' }))
    })
  })
})
