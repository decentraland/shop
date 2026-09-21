import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { intercomData } from './Intercom'

afterEach(() => {
  cleanup()
  vi.doUnmock('~/config')
  vi.doUnmock('decentraland-dapps/dist/components/Intercom')
  vi.resetModules()
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
  async function renderWith(intercomAppId: string) {
    const widget = vi.fn((_props: { appId: string; data: Record<string, string> }) => null)
    // The analytics module installs Segment's snippet on import; clear it so the re-import is a first one.
    ;(window as unknown as { analytics?: unknown }).analytics = undefined
    vi.resetModules()
    vi.doMock('~/config', () => ({ config: { intercomAppId, chainId: 80002, segmentWriteKey: '' } }))
    vi.doMock('decentraland-dapps/dist/components/Intercom', () => ({ default: widget }))
    const { Intercom } = await import('./Intercom')
    render(<Intercom />)
    return widget
  }

  it('does not mount the support widget when no app id is configured', async () => {
    const widget = await renderWith('')
    expect(widget).not.toHaveBeenCalled()
  })

  it('mounts the support widget with the configured app id when one is set', async () => {
    const widget = await renderWith('app-123')
    expect(widget).toHaveBeenCalledTimes(1)
    expect(widget.mock.calls[0][0]).toMatchObject({ appId: 'app-123' })
  })
})
