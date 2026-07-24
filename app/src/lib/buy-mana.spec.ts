import { describe, it, expect, beforeEach, vi } from 'vitest'
import { TradeAssetType, type Trade } from '@dcl/schemas'
import type { ethers as Ethers } from 'ethers'

// Records the on-chain calls buyWithMana makes so we can assert the allowance-then-accept sequence.
const approveCalls: Array<{ spender: string; amount: string }> = []
const acceptCalls: Array<{ trades: unknown[] }> = []
let allowanceWei = '0' // current MANA→marketplace allowance the mocked ERC20 reports

vi.mock('decentraland-transactions', () => ({
  ContractName: { MANAToken: 'MANAToken' },
  getContractName: () => 'DecentralandMarketplacePolygon',
  getContract: (name: string) => ({
    address: name === 'MANAToken' ? '0xmana' : '0xmarket',
    name,
    version: '1',
    abi: ['function accept(uint256[] x)']
  }),
  sendMetaTransaction: vi.fn(),
  MetaTransactionError: class MetaTransactionError extends Error {},
  ErrorCode: { USER_DENIED: 'USER_DENIED' }
}))

// Direct (gas-paying) path: keep the gasless relayer off so buyWithMana takes the accept() branch and
// ensureAuthorization takes the direct approve() branch.
vi.mock('~/lib/gasless-config', () => ({ gaslessConfig: { enabled: false, relayerUrl: '' } }))
vi.mock('~/config', () => ({ config: { rpcUrl: 'http://localhost', chainId: 80002 } }))

vi.mock('ethers', async importOriginal => {
  const actual = await importOriginal<typeof import('ethers')>()
  class MockContract {
    constructor(
      public address: string,
      public abi: unknown,
      public signerOrProvider: unknown
    ) {}
    async allowance() {
      return actual.ethers.BigNumber.from(allowanceWei)
    }
    async approve(spender: string, amount: Ethers.BigNumber) {
      approveCalls.push({ spender, amount: amount.toString() })
      return { wait: async () => ({ transactionHash: '0xapprove' }) }
    }
    async accept(trades: unknown[]) {
      acceptCalls.push({ trades })
      return { wait: async () => ({ transactionHash: '0xmanahash' }) }
    }
  }
  class MockJsonRpcProvider {
    constructor(public url: string) {}
  }
  return {
    ethers: {
      ...actual.ethers,
      Contract: MockContract,
      providers: { ...actual.ethers.providers, JsonRpcProvider: MockJsonRpcProvider }
    }
  }
})

import { buyWithMana } from '~/lib/buy-mana'

const ADDR = (n: string) => '0x' + n.repeat(20)
const BUYER = ADDR('44')

function fakeTrade(): Trade {
  return {
    id: 'trade',
    signer: ADDR('11'),
    signature: '0x',
    network: 'MATIC',
    chainId: 80002,
    type: 'public_nft_order',
    contract: '0xmarket',
    checks: {
      uses: 1,
      expiration: 2_000_000,
      effective: 1_000_000,
      salt: '0x' + '0'.repeat(64),
      contractSignatureIndex: 0,
      signerSignatureIndex: 0,
      allowedRoot: '0x',
      allowedProof: [],
      externalChecks: []
    },
    sent: [{ assetType: TradeAssetType.ERC721, contractAddress: ADDR('22'), value: '5', tokenId: '5', extra: '0x' }],
    received: [
      { assetType: TradeAssetType.USD_PEGGED_MANA, contractAddress: ADDR('33'), value: '1000000000000000000', amount: '1000000000000000000', beneficiary: ADDR('11'), extra: '0x' }
    ]
  } as unknown as Trade
}

// Wallet already on the trade's chain so ensureChain no-ops.
const signer = {
  getAddress: async () => BUYER,
  provider: {
    getNetwork: async () => ({ chainId: 80002 }),
    send: async () => undefined
  }
} as unknown as Ethers.providers.JsonRpcSigner

describe('buyWithMana (direct settlement)', () => {
  beforeEach(() => {
    approveCalls.length = 0
    acceptCalls.length = 0
    allowanceWei = '0'
  })

  it('approves the marketplace then fulfils the trade with accept(), returning the tx hash', async () => {
    const hash = await buyWithMana({ trade: fakeTrade(), buyer: BUYER, signer })

    expect(approveCalls).toHaveLength(1)
    expect(approveCalls[0].spender).toBe('0xmarket')
    expect(acceptCalls).toHaveLength(1)
    expect(acceptCalls[0].trades).toHaveLength(1)
    expect(hash).toBe('0xmanahash')
  })

  it('skips the approval when the marketplace allowance is already set', async () => {
    allowanceWei = '1000000000000000000000000'
    const hash = await buyWithMana({ trade: fakeTrade(), buyer: BUYER, signer })

    expect(approveCalls).toHaveLength(0)
    expect(acceptCalls).toHaveLength(1)
    expect(hash).toBe('0xmanahash')
  })
})
