import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import type { Session } from '~/lib/auth'

// A .zone / dev deployment. Separate spec file from NetworkSelector's because the derived chain list is
// read off the config at module scope, and this is the half that must NOT offer mainnets.
vi.mock('~/config', () => ({ config: { chainId: 80002 } }))

const captureError = vi.fn()
vi.mock('~/lib/monitoring', () => ({ captureError: (...args: unknown[]) => captureError(...args) }))

import { useWalletChain, supportedChains, chainLabel } from './useWalletChain'

type Listener = (...args: unknown[]) => void
type SendImpl = (method: string, params?: unknown[]) => Promise<unknown>

function makeSession(send: SendImpl, chain = 80002) {
  const listeners: Record<string, Listener[]> = {}
  const session = {
    address: '0xabc0000000000000000000000000000000000abc',
    chainId: chain,
    signer: {} as never,
    identity: {} as never,
    providerType: 'injected' as never,
    web3Provider: {
      send: vi.fn(send),
      provider: {
        on: (e: string, cb: Listener) => {
          listeners[e] = [...(listeners[e] ?? []), cb]
        },
        removeListener: (e: string, cb: Listener) => {
          listeners[e] = (listeners[e] ?? []).filter(l => l !== cb)
        }
      }
    } as never
  } as unknown as Session
  return { session, listeners, send: session.web3Provider.send as unknown as ReturnType<typeof vi.fn> }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('supportedChains', () => {
  it('should pair the configured chain with its Ethereum counterpart', () => {
    // Derived from @dcl/schemas' own mapping table, so a testnet deployment offers testnets only.
    expect(supportedChains()).toEqual([80002, 11155111])
    expect(supportedChains(137)).toEqual([137, 1])
  })

  it('should fall back to the configured chain alone when it has no counterpart', () => {
    // Ethereum mainnet is not the Polygon side of any pair, so there is nothing to add.
    expect(supportedChains(1)).toEqual([1])
  })
})

describe('chainLabel', () => {
  it('should name the chains this deployment can offer', () => {
    expect(chainLabel(80002)).toBe('Amoy')
    expect(chainLabel(11155111)).toBe('Sepolia')
    expect(chainLabel(137)).toBe('Polygon')
    expect(chainLabel(1)).toBe('Ethereum Mainnet')
  })

  it('should fall back to the id for a chain it does not know', () => {
    expect(chainLabel(999999)).toBe('Chain 999999')
  })
})

describe('useWalletChain', () => {
  describe('when the wallet does not know the target chain yet', () => {
    it('should offer to add Amoy and nothing else', async () => {
      // 4902 = unrecognised chain. Amoy ships in almost no wallet by default, so this is its normal path.
      const { session, send } = makeSession(async method => {
        if (method === 'eth_chainId') return '0xaa36a7' // Sepolia
        if (method === 'wallet_switchEthereumChain') throw Object.assign(new Error('Unrecognized'), { code: 4902 })
        return null
      })
      const { result } = renderHook(() => useWalletChain(session))
      await waitFor(() => expect(result.current.chainId).toBe(11155111))

      await act(async () => {
        await result.current.switchTo(80002)
      })

      expect(send).toHaveBeenCalledWith('wallet_switchEthereumChain', [{ chainId: '0x13882' }])
      expect(send).toHaveBeenCalledWith('wallet_addEthereumChain', [
        expect.objectContaining({ chainId: '0x13882', chainName: 'Polygon Amoy' })
      ])
    })

    it('should not offer to add any other chain', async () => {
      // Adding whatever chain a wallet happens not to recognise would let a misconfigured environment
      // teach someone's wallet about a network we invented, so only Amoy gets the add.
      const { session, send } = makeSession(async method => {
        if (method === 'eth_chainId') return '0x13882'
        if (method === 'wallet_switchEthereumChain') throw Object.assign(new Error('Unrecognized'), { code: 4902 })
        return null
      })
      const { result } = renderHook(() => useWalletChain(session))
      await waitFor(() => expect(result.current.chainId).toBe(80002))

      await act(async () => {
        await result.current.switchTo(11155111)
      })

      expect(send).not.toHaveBeenCalledWith('wallet_addEthereumChain', expect.anything())
      expect(captureError).toHaveBeenCalled()
      // The chain the wallet is really on is unchanged.
      expect(result.current.chainId).toBe(80002)
    })
  })

  describe('when a switch is already awaiting the wallet', () => {
    it('should ignore a second request until the first one answers', async () => {
      let release!: () => void
      const held = new Promise<void>(resolve => {
        release = resolve
      })
      const { session, send } = makeSession(async method => {
        if (method === 'eth_chainId') return '0x13882'
        if (method === 'wallet_switchEthereumChain') {
          await held
          return null
        }
        return null
      })
      const { result } = renderHook(() => useWalletChain(session))
      await waitFor(() => expect(result.current.chainId).toBe(80002))

      // First request goes out and parks in the wallet, awaiting confirmation. Started inside act (but
      // deliberately not awaited) so the pending state flushes while the request is still open.
      let first!: Promise<void>
      await act(async () => {
        first = result.current.switchTo(11155111)
      })
      expect(result.current.pendingChainId).toBe(11155111)

      // A second click while that prompt is still open must not queue another request behind it.
      await act(async () => {
        await result.current.switchTo(80002)
      })
      expect(send.mock.calls.filter(([m]) => m === 'wallet_switchEthereumChain')).toHaveLength(1)
      expect(result.current.pendingChainId).toBe(11155111)

      await act(async () => {
        release()
        await first
      })
      expect(result.current.pendingChainId).toBeUndefined()
    })
  })

  describe('when the wallet answers eth_chainId with something unusable', () => {
    it('should keep the last known chain rather than blank the label', async () => {
      const { session } = makeSession(async () => {
        throw new Error('wallet is asleep')
      })

      const { result } = renderHook(() => useWalletChain(session))

      // Seeded from the session, and a failed read is not evidence of a different chain.
      await waitFor(() => expect(captureError).toHaveBeenCalled())
      expect(result.current.chainId).toBe(80002)
    })
  })

  describe('when there is no wallet', () => {
    it('should report no chain and ask nothing', () => {
      const { result } = renderHook(() => useWalletChain(null))

      expect(result.current.chainId).toBeUndefined()
      expect(result.current.chains).toEqual([80002, 11155111])
    })
  })
})
