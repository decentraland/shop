import { describe, it, expect, vi, beforeEach } from 'vitest'

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
    transferCalls: [] as unknown[][], // direct (gas-paying) transferFrom calls
    metaTxCalls: [] as unknown[][], // gasless relayer submissions
    // Controllable so a relayed transaction can be driven to confirmed / reverted / never-confirmed.
    waitForTransaction: vi.fn(async () => ({ status: 1 })),
    requireChainCalls: [] as Array<{ provider: unknown; chainId: number }>,
    gaslessConfig: { enabled: false, relayerUrl: 'http://relayer.test' },
    MetaTransactionError,
    ErrorCode: { USER_DENIED: 'USER_DENIED' }
  }
})

vi.mock('~/lib/gasless-config', () => ({ gaslessConfig: h.gaslessConfig }))

vi.mock('decentraland-transactions', () => ({
  ContractName: { ERC721CollectionV2: 'ERC721CollectionV2' },
  getContractName: () => 'DecentralandMarketplacePolygon',
  // The collection meta-tx domain template (name/version/abi) — buy.ts overrides `address` with the
  // specific collection.
  getContract: () => ({ address: '0xcollection', abi: [], name: 'Decentraland Collection', version: '2' }),
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
  readProvider: () => ({ waitForTransaction: () => h.waitForTransaction() }),
  metaTxProviderShim: () => ({ __shim: true })
}))

// transferItem switches the wallet to the collection's chain before the DIRECT transfer tx.
// Keep the real ~/lib/network (errors.ts reads its predicates) and spy only on the chain CHECK. Recording
// the calls is how the tests below assert which legs verify the network and which never touch it.
vi.mock('~/lib/network', async importOriginal => ({
  ...(await importOriginal<typeof import('~/lib/network')>()),
  requireChain: (provider: unknown, chainId: number) => {
    h.requireChainCalls.push({ provider, chainId })
    return Promise.resolve()
  }
}))

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
    async transferFrom(...args: unknown[]) {
      h.transferCalls.push(args)
      return { wait: async () => ({ transactionHash: '0xtransferhash' }) }
    }
  }
  // Stub Interface so the gasless path's encodeFunctionData doesn't parse against a real ABI.
  class MockInterface {
    constructor(_abi: unknown) {}
    encodeFunctionData() {
      return '0xtransfercalldata'
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

import { transferItem } from '~/lib/buy'
import { sendMetaTransaction } from 'decentraland-transactions'

const relay = vi.mocked(sendMetaTransaction)

const signer = {
  getAddress: async () => '0xOWNER00000000000000000000000000000000000',
  provider: { __web3: true }
} as never

const opts = {
  contractAddress: '0xcollection',
  chainId: 80002,
  tokenId: '42',
  to: '0xRECIPIENT000000000000000000000000000000',
  signer
}

beforeEach(() => {
  h.transferCalls.length = 0
  h.metaTxCalls.length = 0
  h.requireChainCalls.length = 0
  h.gaslessConfig.enabled = false
  relay.mockReset()
  relay.mockImplementation(() => {
    h.metaTxCalls.push([])
    return Promise.resolve('0xrelayhash')
  })
})

describe('transferItem — direct (gas-paying) fallback, gasless disabled', () => {
  it('switches to the collection chain and sends transferFrom(from, to, tokenId)', async () => {
    const hash = await transferItem(opts)

    expect(hash).toBe('0xtransferhash')
    expect(h.requireChainCalls).toEqual([{ provider: { __web3: true }, chainId: 80002 }])
    expect(h.transferCalls).toHaveLength(1)
    const [from, to, tokenId] = h.transferCalls[0] as string[]
    expect(from).toBe('0xowner00000000000000000000000000000000000') // lowercased sender
    expect(to).toBe(opts.to)
    expect(tokenId).toBe('42')
    expect(h.metaTxCalls).toHaveLength(0) // relayer never used when gasless is off
  })
})

describe('transferItem — gasless (relayer) path, gasless enabled', () => {
  beforeEach(() => {
    h.gaslessConfig.enabled = true
  })

  it('relays the transfer via sendMetaTransaction and never sends a direct tx', async () => {
    const hash = await transferItem(opts)

    expect(hash).toBe('0xrelayhash')
    expect(h.metaTxCalls).toHaveLength(1)
    // No direct transferFrom tx and no just-in-time chain switch (the relayer handles the chain).
    expect(h.transferCalls).toHaveLength(0)
    expect(h.requireChainCalls).toHaveLength(0)
  })

  it('propagates a user rejection instead of silently falling back to a gas-paying tx', async () => {
    relay.mockRejectedValueOnce(new h.MetaTransactionError('user denied', h.ErrorCode.USER_DENIED))

    await expect(transferItem(opts)).rejects.toBeInstanceOf(h.MetaTransactionError)
    expect(h.transferCalls).toHaveLength(0)
  })

  it('falls back to a direct tx when the relayer fails for a non-rejection reason', async () => {
    relay.mockRejectedValueOnce(new Error('relayer 503'))

    const hash = await transferItem(opts)

    expect(hash).toBe('0xtransferhash')
    expect(h.transferCalls).toHaveLength(1)
    expect(h.requireChainCalls).toEqual([{ provider: { __web3: true }, chainId: 80002 }])
  })
})

/**
 * A PENDING relayed transaction must NOT fall through to the direct path.
 *
 * Pending means no receipt yet, so the relayed transfer may still mine. Re-submitting it directly would
 * move the item TWICE. A revert is the opposite — it moved nothing, so falling back is correct. Before
 * confirmMetaTx the two were indistinguishable: the wait resolved on any receipt, so a revert read as
 * success and a timeout hit the catch-all that falls back.
 */
describe('transferItem — a relayed transfer whose outcome is unknown', () => {
  beforeEach(() => {
    h.gaslessConfig.enabled = true
  })

  it('propagates instead of re-submitting directly when the receipt never arrives', async () => {
    h.waitForTransaction.mockRejectedValueOnce(new Error('timeout exceeded'))

    await expect(transferItem(opts)).rejects.toThrow(/not confirmed in time/)
    // The direct path is the double-send: it must not have run.
    expect(h.transferCalls).toHaveLength(0)
  })

  it('DOES fall back when the relayed transfer reverted, because it moved nothing', async () => {
    h.waitForTransaction.mockResolvedValueOnce({ status: 0 })

    const hash = await transferItem(opts)

    expect(hash).toBe('0xtransferhash')
    expect(h.transferCalls).toHaveLength(1)
  })
})
