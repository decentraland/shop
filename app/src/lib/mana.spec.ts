import { describe, it, expect, vi } from 'vitest'
import { TradeAssetType, type Trade } from '@dcl/schemas'

// Mocked marketplace/oracle resolution — mirrors buy.spec.ts. balanceOf drives readManaBalanceWei;
// manaUsdAggregator/decimals/latestRoundData drive the USD_PEGGED_MANA price read.
let aggDecimals = 8
let aggAnswer = '50000000' // $0.50/MANA at 8 decimals
let balanceOfWei = '0'

vi.mock('decentraland-transactions', () => ({
  ContractName: { MANAToken: 'MANAToken' },
  getContractName: () => 'DecentralandMarketplacePolygon',
  getContract: (name: string) => ({
    address: name === 'MANAToken' ? '0xmana' : '0xmarket',
    name,
    version: '1',
    abi: ['function accept(uint256[] x)']
  })
}))

vi.mock('~/config', () => ({ config: { rpcUrl: 'http://localhost', chainId: 80002 } }))

vi.mock('ethers', async importOriginal => {
  const actual = await importOriginal<typeof import('ethers')>()
  class MockContract {
    constructor(
      public address: string,
      public abi: unknown,
      public signerOrProvider: unknown
    ) {}
    async balanceOf() {
      return actual.ethers.BigNumber.from(balanceOfWei)
    }
    async manaUsdAggregator() {
      return '0xaggregator'
    }
    async decimals() {
      return aggDecimals
    }
    async latestRoundData() {
      return [0, actual.ethers.BigNumber.from(aggAnswer), 0, 0, 0]
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

import { readManaBalanceWei, readTradeManaPriceWei, hasEnoughMana, formatMana } from '~/lib/mana'

function fakeTrade(receivedAssetType: number, amount = '1000000000000000000'): Trade {
  return {
    id: 'trade',
    signer: '0xseller',
    signature: '0x',
    network: 'MATIC',
    chainId: 80002,
    type: 'public_nft_order',
    contract: '0xmarket',
    checks: {},
    sent: [],
    received: [
      {
        assetType: receivedAssetType,
        contractAddress: '0xmana',
        amount,
        value: amount,
        beneficiary: '0xseller',
        extra: '0x'
      }
    ]
  } as unknown as Trade
}

describe('readManaBalanceWei', () => {
  it('returns the ERC20 balanceOf as a bigint', async () => {
    balanceOfWei = '2500000000000000000000'
    const bal = await readManaBalanceWei('0xbuyer', 80002)
    expect(bal).toBe(2_500_000000000000000000n)
  })
})

describe('readTradeManaPriceWei', () => {
  it('converts a USD-pegged trade to MANA via the oracle (1 USD @ $0.50/MANA = 2 MANA)', async () => {
    aggDecimals = 8
    aggAnswer = '50000000' // $0.50
    // received amount is $1 in USD wei (1e18) → 1e18 * 1e8 / 5e7 = 2e18 wei = 2 MANA.
    const wei = await readTradeManaPriceWei(fakeTrade(TradeAssetType.USD_PEGGED_MANA, '1000000000000000000'))
    expect(wei).toBe(2_000000000000000000n)
  })

  it('uses the amount directly for a plain-ERC20 (non-pegged) MANA trade', async () => {
    const wei = await readTradeManaPriceWei(fakeTrade(TradeAssetType.ERC20, '7000000000000000000'))
    expect(wei).toBe(7_000000000000000000n)
  })
})

describe('hasEnoughMana', () => {
  it('is true only when the balance covers the price', () => {
    expect(hasEnoughMana(5n, 5n)).toBe(true)
    expect(hasEnoughMana(6n, 5n)).toBe(true)
    expect(hasEnoughMana(4n, 5n)).toBe(false)
  })
})

describe('formatMana', () => {
  it('renders whole MANA grouped by thousands', () => {
    expect(formatMana(1_000000000000000000n)).toBe('1')
    expect(formatMana(1500_000000000000000000n)).toBe('1,500')
  })
})
