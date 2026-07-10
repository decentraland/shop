import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Trade } from '@dcl/schemas'

// Capture every cancelSignature(...) call so we can assert the argument SHAPE — the bug was
// passing a single trade to a `cancelSignature(tuple[])` function, which reverts on encode.
const cancelCalls: unknown[][] = []

vi.mock('decentraland-transactions', () => ({
  ContractName: {},
  getContractName: () => 'DecentralandMarketplacePolygon',
  getContract: () => ({ address: '0xmarket', abi: ['function cancelSignature(tuple[] _trades)'] })
}))

vi.mock('~/config', () => ({ config: { chainId: 80002, rpcUrl: 'http://localhost' } }))

// cancelListing must switch the wallet to the trade's chain before the (real) cancel tx. Capture the
// call so we can assert the chain-switch happens — and with the right provider + chainId.
const ensureChainCalls: Array<{ provider: unknown; chainId: number }> = []
vi.mock('~/lib/trades', () => ({
  ensureChain: (provider: unknown, chainId: number) => {
    ensureChainCalls.push({ provider, chainId })
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
      cancelCalls.push(args)
      return { wait: async () => ({ transactionHash: '0xcancelhash' }) }
    }
  }
  return { ethers: { ...actual.ethers, Contract: MockContract } }
})

// eslint-disable-next-line import/first
import { cancelListing } from '~/lib/buy'

const signer = {
  getAddress: async () => '0xSELLER0000000000000000000000000000000000',
  provider: { __web3: true }
} as never
const trade = { contract: '0xmarket', chainId: 80002 } as unknown as Trade

beforeEach(() => {
  cancelCalls.length = 0
  ensureChainCalls.length = 0
})

describe('cancelListing', () => {
  it('calls cancelSignature with a Trade[] array — not a single trade (regression guard)', async () => {
    const hash = await cancelListing({ trade, signer })

    expect(hash).toBe('0xcancelhash')
    expect(cancelCalls).toHaveLength(1)
    const [firstArg] = cancelCalls[0]
    // The on-chain `cancelSignature(_trades)` takes tuple[]; passing a single trade fails to encode.
    expect(Array.isArray(firstArg)).toBe(true)
    expect(firstArg as unknown[]).toHaveLength(1)
    expect((firstArg as Array<{ __onchain?: boolean }>)[0]).toMatchObject({ __onchain: true })
  })

  it('switches the wallet to the trade chain before sending the cancel tx', async () => {
    await cancelListing({ trade, signer })

    // A real tx: the wallet must be on the trade's chain first (a restored session may be elsewhere).
    expect(ensureChainCalls).toEqual([{ provider: { __web3: true }, chainId: 80002 }])
  })
})
