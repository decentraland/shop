import { describe, it, expect, vi } from 'vitest'
import { ChainId } from '@dcl/schemas'
import {
  activeChainId,
  chainLabel,
  isWalletUnauthorizedError,
  isWrongNetworkError,
  requireChain,
  switchChain,
  WrongNetworkError
} from '~/lib/network'

// A wallet that answers eth_chainId with the hex string a real provider returns.
function wallet(chainId: number, overrides: { send?: ReturnType<typeof vi.fn> } = {}) {
  const send =
    overrides.send ??
    vi.fn(async (method: string) => (method === 'eth_chainId' ? `0x${chainId.toString(16)}` : undefined))
  return { provider: { send, getNetwork: vi.fn() }, send }
}

describe('reading the wallet chain', () => {
  it('asks the wallet directly, so a network changed after page load is still seen', async () => {
    const w = wallet(ChainId.ETHEREUM_MAINNET)
    expect(await activeChainId(w.provider as never)).toBe(1)
    // eth_chainId, NOT getNetwork: ethers caches the network a Web3Provider first detected, so a user who
    // switched networks mid-session would otherwise be measured against a stale value.
    expect(w.send).toHaveBeenCalledWith('eth_chainId', [])
    expect(w.provider.getNetwork).not.toHaveBeenCalled()
  })

  it('accepts a wallet that answers with a number instead of a hex string', async () => {
    const send = vi.fn(async () => 137)
    const w = wallet(0, { send })
    expect(await activeChainId(w.provider as never)).toBe(137)
  })

  // It used to fall back to `provider.getNetwork()` here, which is the exact cache this function exists to
  // avoid: it would answer with a plausible, possibly stale chain, and a wrong chain on a gas-paying leg
  // means submitting to an address that holds no code — a green receipt for nothing.
  it('throws on an unusable answer rather than reaching for the cache it avoids', async () => {
    const send = vi.fn(async () => undefined)
    const provider = { send, getNetwork: vi.fn().mockResolvedValue({ chainId: 80002 }) }
    await expect(activeChainId(provider as never)).rejects.toThrow(/unusable/)
    expect(provider.getNetwork).not.toHaveBeenCalled()
  })
})

describe('requiring a chain', () => {
  it('passes silently when the wallet is already there, without touching the wallet', async () => {
    const w = wallet(ChainId.MATIC_AMOY)
    await expect(requireChain(w.provider as never, ChainId.MATIC_AMOY)).resolves.toBeUndefined()
    expect(w.send).toHaveBeenCalledTimes(1) // the read, and nothing else
  })

  /**
   * The whole point of this module: a wrong network is REPORTED, never corrected behind the user's back.
   * The shop switching networks by itself is what put a buyer who had deliberately chosen Ethereum back on
   * Polygon with no prompt, and handed them a wallet error that named a revert instead of a network.
   */
  it('refuses, and does NOT request a switch, when the wallet is elsewhere', async () => {
    const w = wallet(ChainId.ETHEREUM_MAINNET)

    await expect(requireChain(w.provider as never, ChainId.MATIC_MAINNET)).rejects.toBeInstanceOf(WrongNetworkError)
    expect(w.send).not.toHaveBeenCalledWith('wallet_switchEthereumChain', expect.anything())
    expect(w.send).not.toHaveBeenCalledWith('wallet_addEthereumChain', expect.anything())
  })

  it('carries both chains so the message can name them', async () => {
    const w = wallet(ChainId.ETHEREUM_MAINNET)
    const err = await requireChain(w.provider as never, ChainId.MATIC_MAINNET).catch(e => e)

    expect(isWrongNetworkError(err)).toBe(true)
    expect(err).toMatchObject({ current: 1, required: 137 })
    expect(err.message).toContain('Ethereum Mainnet')
    expect(err.message).toContain('Polygon')
  })
})

describe('switching the chain (only ever from the user’s click)', () => {
  it('asks the wallet for the target chain in hex', async () => {
    const w = wallet(ChainId.ETHEREUM_MAINNET)
    await switchChain(w.provider as never, ChainId.MATIC_MAINNET)
    expect(w.send).toHaveBeenCalledWith('wallet_switchEthereumChain', [{ chainId: '0x89' }])
  })

  it('adds Amoy when the wallet does not know it yet (4902)', async () => {
    const send = vi.fn().mockRejectedValueOnce({ code: 4902 }).mockResolvedValueOnce(undefined)
    await switchChain({ send } as never, ChainId.MATIC_AMOY)
    expect(send).toHaveBeenNthCalledWith(2, 'wallet_addEthereumChain', [
      expect.objectContaining({ chainId: '0x13882' })
    ])
  })

  it('does not try to ADD a chain that is not Amoy', async () => {
    const send = vi.fn().mockRejectedValue({ code: 4902 })
    await expect(switchChain({ send } as never, ChainId.MATIC_MAINNET)).rejects.toMatchObject({ code: 4902 })
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('propagates a rejection — the user declining is an answer, not a failure to retry around', async () => {
    const send = vi.fn().mockRejectedValue({ code: 4001 })
    await expect(switchChain({ send } as never, ChainId.MATIC_MAINNET)).rejects.toMatchObject({ code: 4001 })
  })
})

/**
 * `-32006` / `4100` mean the WALLET refused the request, never that a contract reverted — but ethers reports
 * it as a CALL_EXCEPTION with "reverted without a reason string", which sent us reading contract bytecode for
 * a problem that never left the browser. Recognising it is what lets the UI say something true.
 */
describe('recognising a wallet that refused the request', () => {
  it('matches -32006 and 4100 at the top level', () => {
    expect(isWalletUnauthorizedError({ code: -32006, message: 'Unauthorized' })).toBe(true)
    expect(isWalletUnauthorizedError({ code: 4100 })).toBe(true)
  })

  it('finds it nested where ethers actually puts it', () => {
    // The shape seen in production: ethers' CALL_EXCEPTION wrapping the provider's own error.
    const err = {
      code: 'CALL_EXCEPTION',
      message: 'missing revert data; transaction reverted without a reason string',
      error: { code: -32006, message: 'Unauthorized', data: { httpStatus: 401 } }
    }
    expect(isWalletUnauthorizedError(err)).toBe(true)
  })

  it('matches an inner 401 carried on data', () => {
    expect(isWalletUnauthorizedError({ cause: { data: { httpStatus: 401 } } })).toBe(true)
  })

  it('does not claim ordinary failures', () => {
    expect(isWalletUnauthorizedError({ code: 4001, message: 'User rejected' })).toBe(false)
    expect(isWalletUnauthorizedError(new Error('reverted'))).toBe(false)
    expect(isWalletUnauthorizedError(null)).toBe(false)
    // Our own API's 401 is a different problem with a different answer (sign in again), so a message match
    // is deliberately NOT used here.
    expect(isWalletUnauthorizedError({ status: 401, message: 'Unauthorized' })).toBe(false)
  })

  it('does not recurse forever on a self-referential error', () => {
    const err: { code: string; error?: unknown } = { code: 'SERVER_ERROR' }
    err.error = err
    expect(isWalletUnauthorizedError(err)).toBe(false)
  })
})

describe('naming a chain', () => {
  it('uses the names people recognise', () => {
    expect(chainLabel(ChainId.MATIC_MAINNET)).toBe('Polygon')
    expect(chainLabel(ChainId.ETHEREUM_MAINNET)).toBe('Ethereum Mainnet')
    expect(chainLabel(ChainId.MATIC_AMOY)).toBe('Amoy')
  })

  it('still says something for a chain we do not know', () => {
    expect(chainLabel(1234)).toBe('chain 1234')
  })
})
