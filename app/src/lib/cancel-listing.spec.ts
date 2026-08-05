import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Trade } from '@dcl/schemas'

// Everything the hoisted vi.mock factories reference must itself be hoisted (vi.mock is lifted above
// top-level declarations, so a plain `const`/`class` here would be in the TDZ when a factory runs).
const h = vi.hoisted(() => {
  class MetaTransactionError extends Error {
    code: string
    constructor(message: string, code: string) {
      super(message)
      this.code = code
    }
  }
  return {
    cancelCalls: [] as unknown[][], // direct (gas-paying) cancelSignature calls
    metaTxCalls: [] as unknown[][], // gasless relayer submissions
    requireChainCalls: [] as Array<{ provider: unknown; chainId: number }>,
    gaslessConfig: { enabled: false, relayerUrl: 'http://relayer.test' },
    MetaTransactionError,
    ErrorCode: { USER_DENIED: 'USER_DENIED' }
  }
})

vi.mock('~/lib/gasless-config', () => ({ gaslessConfig: h.gaslessConfig }))

vi.mock('decentraland-transactions', () => ({
  ContractName: {},
  getContractName: () => 'DecentralandMarketplacePolygon',
  getContract: () => ({ address: '0xmarket', abi: ['function cancelSignature(tuple[] _trades)'] }),
  sendMetaTransaction: vi.fn(() => {
    h.metaTxCalls.push([])
    return Promise.resolve('0xrelayhash')
  }),
  MetaTransactionError: h.MetaTransactionError,
  ErrorCode: h.ErrorCode
}))

vi.mock('~/config', () => ({ config: { chainId: 80002, rpcUrl: 'http://localhost' } }))

// The gasless path routes node reads to a reliable RPC via the shim; stub both so no network is hit.
vi.mock('~/lib/authorizations', () => ({
  // status 1 explicitly: an empty receipt passed confirmMetaTx only because undefined !== 0, i.e. by
  // accident rather than by assertion. A relayed-path spec should say the transaction succeeded.
  readProvider: () => ({ waitForTransaction: () => Promise.resolve({ status: 1 }) }),
  metaTxProviderShim: () => ({ __shim: true })
}))

// cancelListing requires the wallet to already be on the trade's chain before the DIRECT cancel tx.
// Keep the real ~/lib/network (errors.ts reads its predicates) and spy only on the chain CHECK. Recording
// the calls is how the tests below assert which legs verify the network and which never touch it.
vi.mock('~/lib/network', async importOriginal => ({
  ...(await importOriginal<typeof import('~/lib/network')>()),
  requireChain: (provider: unknown, chainId: number) => {
    h.requireChainCalls.push({ provider, chainId })
    return Promise.resolve()
  }
}))

// Sentinel getOnChainTrade so the assertion is about the ARITY (array wrapping), not encoding internals.
vi.mock('~/lib/trade-encoding', () => ({
  getOnChainTrade: (trade: unknown) => ({ __onchain: true, from: trade }),
  amoyGasOverrides: () => ({})
}))

vi.mock('ethers', async importOriginal => {
  const actual = await importOriginal<typeof import('ethers')>()
  class MockContract {
    constructor(
      public address: string,
      public abi: unknown,
      public signer: unknown
    ) {}
    async cancelSignature(...args: unknown[]) {
      h.cancelCalls.push(args)
      return { wait: async () => ({ transactionHash: '0xcancelhash' }) }
    }
  }
  // Stub Interface so the gasless path's encodeFunctionData doesn't try to parse/encode the sentinel
  // trade against a real ABI (the direct path uses MockContract, which ignores the ABI).
  class MockInterface {
    constructor(_abi: unknown) {}
    encodeFunctionData() {
      return '0xcancelcalldata'
    }
  }
  return {
    ethers: {
      ...actual.ethers,
      Contract: MockContract,
      utils: { ...actual.ethers.utils, Interface: MockInterface }
    }
  }
})

import { cancelListing, GaslessCancelFailedError } from '~/lib/buy'
import { sendMetaTransaction } from 'decentraland-transactions'

const relay = vi.mocked(sendMetaTransaction)

const signer = {
  getAddress: async () => '0xSELLER0000000000000000000000000000000000',
  provider: { __web3: true }
} as never
const trade = { contract: '0xmarket', chainId: 80002 } as unknown as Trade

beforeEach(() => {
  h.cancelCalls.length = 0
  h.metaTxCalls.length = 0
  h.requireChainCalls.length = 0
  h.gaslessConfig.enabled = false
  relay.mockReset()
  relay.mockImplementation(() => {
    h.metaTxCalls.push([])
    return Promise.resolve('0xrelayhash')
  })
})

describe('cancelListing — direct (gas-paying) fallback, gasless disabled', () => {
  it('calls cancelSignature with a Trade[] array — not a single trade (regression guard)', async () => {
    const hash = await cancelListing({ trade, signer })

    expect(hash).toBe('0xcancelhash')
    expect(h.cancelCalls).toHaveLength(1)
    const [firstArg] = h.cancelCalls[0]
    // The on-chain `cancelSignature(_trades)` takes tuple[]; passing a single trade fails to encode.
    expect(Array.isArray(firstArg)).toBe(true)
    expect(firstArg as unknown[]).toHaveLength(1)
    expect((firstArg as Array<{ __onchain?: boolean }>)[0]).toMatchObject({ __onchain: true })
  })

  it('switches the wallet to the trade chain before sending the cancel tx', async () => {
    await cancelListing({ trade, signer })

    expect(h.requireChainCalls).toEqual([{ provider: { __web3: true }, chainId: 80002 }])
    expect(h.metaTxCalls).toHaveLength(0) // relayer never used when gasless is off
  })
})

describe('cancelListing — gasless (relayer) path, gasless enabled', () => {
  beforeEach(() => {
    h.gaslessConfig.enabled = true
  })

  it('relays the cancel via sendMetaTransaction and never sends a direct tx', async () => {
    const hash = await cancelListing({ trade, signer })

    expect(hash).toBe('0xrelayhash')
    expect(h.metaTxCalls).toHaveLength(1)
    // No direct cancelSignature tx and no just-in-time chain switch (the relayer handles the chain).
    expect(h.cancelCalls).toHaveLength(0)
    expect(h.requireChainCalls).toHaveLength(0)
  })

  it('propagates a user rejection instead of silently falling back to a gas-paying tx', async () => {
    relay.mockRejectedValueOnce(new h.MetaTransactionError('user denied', h.ErrorCode.USER_DENIED))

    await expect(cancelListing({ trade, signer })).rejects.toBeInstanceOf(h.MetaTransactionError)
    expect(h.cancelCalls).toHaveLength(0)
  })

  it('falls back to a direct tx when the relayer fails for a non-rejection reason', async () => {
    relay.mockRejectedValueOnce(new Error('relayer 503'))

    const hash = await cancelListing({ trade, signer })

    expect(hash).toBe('0xcancelhash')
    expect(h.cancelCalls).toHaveLength(1)
    expect(h.requireChainCalls).toEqual([{ provider: { __web3: true }, chainId: 80002 }])
  })
})

/**
 * ASKING BEFORE SPENDING THE SELLER'S GAS.
 *
 * The silent fallback is what stranded a creator: it made a wallet network request minutes after the click,
 * and MetaMask refuses unsolicited wallet requests (-32006), so the only route left was unreachable exactly
 * when the relay had failed. 'gasless-only' reports back so the UI can offer the gas-paying route as the
 * seller's own click, where the wallet accepts it.
 */
describe('cancelListing — choosing the rail', () => {
  beforeEach(() => {
    h.gaslessConfig.enabled = true
  })

  it('reports back instead of paying gas when the caller asked not to', async () => {
    relay.mockRejectedValueOnce(new Error('relayer 503'))

    await expect(cancelListing({ trade, signer, mode: 'gasless-only' })).rejects.toBeInstanceOf(
      GaslessCancelFailedError
    )
    // The point: nothing was sent and the wallet was never asked to switch networks.
    expect(h.cancelCalls).toHaveLength(0)
    expect(h.requireChainCalls).toHaveLength(0)
  })

  it('carries the underlying failure as the cause, so a pending relay stays distinguishable', async () => {
    const underlying = new Error('relayer 503')
    relay.mockRejectedValueOnce(underlying)

    await expect(cancelListing({ trade, signer, mode: 'gasless-only' })).rejects.toMatchObject({
      cause: underlying
    })
  })

  /**
   * A revert and a timeout are not the same news, and the seller has to be told which one they got.
   *
   * A reverted receipt is final: that transaction changed nothing, and no amount of waiting will make it land
   * — so telling someone "it may still go through" is simply false. A timeout genuinely may still land, since
   * the relayer bumps fees and resubmits. `definitive` is what lets the page pick the true sentence, while the
   * gas-paying route stays on offer either way (for a revert it is the RIGHT next step, because the
   * cancellation provably did not happen).
   */
  it('marks a REVERTED relay as definitive', async () => {
    const { MetaTxRevertedError } = await import('~/lib/tx-confirm')
    relay.mockRejectedValueOnce(new MetaTxRevertedError('the listing cancellation', '0xdead'))

    const err = await cancelListing({ trade, signer, mode: 'gasless-only' }).catch(e => e)

    expect(err).toBeInstanceOf(GaslessCancelFailedError)
    expect(err.definitive).toBe(true)
  })

  it('does NOT mark an unconfirmed relay as definitive', async () => {
    const { MetaTxPendingError } = await import('~/lib/tx-confirm')
    relay.mockRejectedValueOnce(new MetaTxPendingError('the listing cancellation', '0xpending'))

    const err = await cancelListing({ trade, signer, mode: 'gasless-only' }).catch(e => e)

    expect(err.definitive).toBe(false)
  })

  it('goes straight to the gas-paying tx on direct mode, without trying the relayer', async () => {
    const hash = await cancelListing({ trade, signer, mode: 'direct' })

    expect(hash).toBe('0xcancelhash')
    expect(h.metaTxCalls).toHaveLength(0)
    expect(h.cancelCalls).toHaveLength(1)
    expect(h.requireChainCalls).toEqual([{ provider: { __web3: true }, chainId: 80002 }])
  })

  it('still relays on gasless-only when the relay works', async () => {
    const hash = await cancelListing({ trade, signer, mode: 'gasless-only' })

    expect(hash).toBe('0xrelayhash')
    expect(h.cancelCalls).toHaveLength(0)
  })

  // 'auto' is what every other caller uses; its behaviour must not move.
  it('keeps the historical silent fallback on auto', async () => {
    relay.mockRejectedValueOnce(new Error('relayer 503'))

    await expect(cancelListing({ trade, signer })).resolves.toBe('0xcancelhash')
    expect(h.cancelCalls).toHaveLength(1)
  })
})
