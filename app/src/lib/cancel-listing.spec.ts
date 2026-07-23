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
    ensureChainCalls: [] as Array<{ provider: unknown; chainId: number }>,
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
  readProvider: () => ({ waitForTransaction: () => Promise.resolve({}) }),
  metaTxProviderShim: () => ({ __shim: true })
}))

// cancelListing switches the wallet to the trade's chain before the DIRECT cancel tx.
vi.mock('~/lib/trades', () => ({
  ensureChain: (provider: unknown, chainId: number) => {
    h.ensureChainCalls.push({ provider, chainId })
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

import { cancelListing } from '~/lib/buy'
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
  h.ensureChainCalls.length = 0
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

    expect(h.ensureChainCalls).toEqual([{ provider: { __web3: true }, chainId: 80002 }])
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
    expect(h.ensureChainCalls).toHaveLength(0)
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
    expect(h.ensureChainCalls).toEqual([{ provider: { __web3: true }, chainId: 80002 }])
  })
})
