import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TradeAssetType, type Trade } from '@dcl/schemas'
import type { ethers as Ethers } from 'ethers'

// Mutable flag/relayer, ABIs and programmable on-chain read stubs. vi.hoisted lets the vi.mock
// factories (hoisted to the top of the file) safely reference these shared handles.
const { gasless, nonceMock, waitForTransactionMock, CM_ABI, MARKET_ABI } = vi.hoisted(() => ({
  gasless: { enabled: true, relayerUrl: 'https://relayer.test/v1' },
  // getNonce(buyer) → a BigNumber-like value (only .toString() is read by the target).
  nonceMock: vi.fn(async (_user: string): Promise<{ toString(): string }> => ({ toString: () => '7' })),
  // waitForTransaction(hash, confirmations, timeout) → a receipt-like value (only .status is read).
  waitForTransactionMock: vi.fn(
    async (..._args: unknown[]): Promise<{ status: number } | null> => ({ status: 1 })
  ),
  // A realistic CreditsManager ABI: enough for Interface.encodeFunctionData('useCredits') and
  // ('executeMetaTransaction') to resolve real selectors + encode real bytes (real ethers utils).
  CM_ABI: [
    'function executeMetaTransaction(address userAddress, bytes functionData, bytes signature) returns (bytes)',
    'function getNonce(address user) view returns (uint256)',
    'function useCredits(tuple(tuple(uint256 value,uint256 expiresAt,bytes32 salt)[] credits, bytes[] creditsSignatures, tuple(address target, bytes4 selector, bytes data, uint256 expiresAt, bytes32 salt) externalCall, bytes customExternalCallSignature, uint256 maxUncreditedValue, uint256 maxCreditedValue) args)'
  ],
  // A minimal marketplace ABI with an `accept` fragment so buildAcceptCalldata resolves its selector.
  MARKET_ABI: [
    'function accept(tuple(address signer,bytes signature,tuple(uint256 uses,uint256 expiration,uint256 effective,bytes32 salt,uint256 contractSignatureIndex,uint256 signerSignatureIndex,bytes32 allowedRoot,bytes32[] allowedProof,tuple(address contractAddress,bytes4 selector,bytes value,bool required)[] externalChecks) checks,tuple(uint256 assetType,address contractAddress,uint256 value,address beneficiary,bytes extra)[] sent,tuple(uint256 assetType,address contractAddress,uint256 value,address beneficiary,bytes extra)[] received)[] trades)'
  ]
}))

vi.mock('~/lib/gasless-config', () => ({
  gaslessConfig: gasless,
  gaslessEnabled: () => gasless.enabled
}))

vi.mock('~/config', () => ({ config: { rpcUrl: 'http://localhost', chainId: 80002 } }))

vi.mock('decentraland-transactions', () => ({
  ContractName: { CreditsManager: 'CreditsManager' },
  getContractName: () => 'DecentralandMarketplacePolygon',
  getContract: (name: string) =>
    name === 'CreditsManager'
      ? { address: '0x' + 'cc'.repeat(20), name: 'CreditsManager', version: '1', abi: CM_ABI }
      : { address: '0x' + 'ee'.repeat(20), name: 'DecentralandMarketplacePolygon', version: '1', abi: MARKET_ABI }
}))

// Keep real ethers utils/BigNumber/Interface; swap only the network-touching Contract + provider.
vi.mock('ethers', async importOriginal => {
  const actual = await importOriginal<typeof import('ethers')>()
  class MockContract {
    constructor(
      public address: string,
      public abi: unknown,
      public providerOrSigner: unknown
    ) {}
    getNonce(user: string) {
      return nonceMock(user)
    }
  }
  class MockJsonRpcProvider {
    constructor(public url: string) {}
    waitForTransaction(...args: unknown[]) {
      return waitForTransactionMock(...args)
    }
  }
  return {
    ethers: {
      ...actual.ethers,
      Contract: MockContract,
      providers: { ...actual.ethers.providers, JsonRpcProvider: MockJsonRpcProvider }
    }
  }
})

// eslint-disable-next-line import/first
import {
  GaslessUnavailableError,
  buyGasless,
  buyManyGasless,
  waitForSettlement
} from '~/lib/buy-gasless'
// eslint-disable-next-line import/first
import type { CreditPurchase, SpendableCredit } from '~/lib/trade-encoding'

const ADDR = (n: string) => '0x' + n.repeat(20)
const B32 = (n: string) => '0x' + n.repeat(64)
const SELLER = ADDR('11')
const NFT = ADDR('22')
const MANA = ADDR('33')
const BUYER = ADDR('44')

function credit(id: string, amount: string): SpendableCredit {
  // signature must be valid hex bytes (ethers ABI-encodes it as `bytes`).
  return { id, amount, availableAmount: amount, expiresAt: 9_999_999_999, signature: '0xabcd' }
}

function fakeTrade(contract: string): Trade {
  return {
    id: 'trade',
    signer: SELLER,
    signature: '0x',
    network: 'MATIC',
    chainId: 80002,
    type: 'public_nft_order',
    contract,
    checks: {
      uses: 1,
      expiration: 2_000_000,
      effective: 1_000_000,
      salt: B32('0'),
      contractSignatureIndex: 0,
      signerSignatureIndex: 0,
      allowedRoot: '0x',
      allowedProof: [],
      externalChecks: []
    },
    sent: [{ assetType: TradeAssetType.ERC721, contractAddress: NFT, value: '5', tokenId: '5', extra: '0x' }],
    received: [
      {
        assetType: TradeAssetType.USD_PEGGED_MANA,
        contractAddress: MANA,
        value: '1000000000000000000',
        amount: '1000000000000000000',
        beneficiary: SELLER,
        extra: '0x'
      }
    ]
  } as unknown as Trade
}

// A signer whose _signTypedData is programmable per test. The intersection keeps it assignable to
// ethers.Signer (buyGasless's param) while exposing the spy for call-count assertions.
type SpiedSigner = Ethers.Signer & {
  _signTypedData: ReturnType<typeof vi.fn>
}
function makeSigner(sign: (domain: unknown, types: unknown, message: unknown) => Promise<string>): SpiedSigner {
  return { _signTypedData: vi.fn(sign) } as unknown as SpiedSigner
}

// The relayer response body / status for the next fetch call.
function stubFetch(body: unknown, ok = true, status = 200) {
  const fn = vi.fn(async () => ({ ok, status, json: async () => body }))
  vi.stubGlobal('fetch', fn)
  return fn
}

beforeEach(() => {
  gasless.enabled = true
  gasless.relayerUrl = 'https://relayer.test/v1'
  nonceMock.mockClear()
  nonceMock.mockResolvedValue({ toString: () => '7' })
  waitForTransactionMock.mockClear()
  waitForTransactionMock.mockResolvedValue({ status: 1 })
  vi.unstubAllGlobals()
})

describe('when the gasless feature flag is off', () => {
  beforeEach(() => {
    gasless.enabled = false
  })

  it('rejects a single buy with a disabled GaslessUnavailableError', async () => {
    const signer = makeSigner(async () => '0xsig')
    await expect(
      buyGasless({ trade: fakeTrade('0xmarket'), buyer: BUYER, signer, credits: [credit(B32('1'), '100')], maxCreditedValue: '100' })
    ).rejects.toMatchObject({ name: 'GaslessUnavailableError', reason: 'disabled' })
  })

  it('rejects a batch buy with a disabled GaslessUnavailableError', async () => {
    const signer = makeSigner(async () => '0xsig')
    const purchases: CreditPurchase[] = [
      { trade: fakeTrade('0xmarket'), credits: [credit(B32('1'), '100')], maxCreditedValue: '100' }
    ]
    await expect(buyManyGasless({ purchases, buyer: BUYER, signer })).rejects.toBeInstanceOf(GaslessUnavailableError)
  })

  it('does not sign or hit the relayer when disabled', async () => {
    const fetchMock = stubFetch({ txHash: '0xabc' })
    const signer = makeSigner(async () => '0xsig')
    await expect(
      buyGasless({ trade: fakeTrade('0xmarket'), buyer: BUYER, signer, credits: [credit(B32('1'), '100')], maxCreditedValue: '100' })
    ).rejects.toBeInstanceOf(GaslessUnavailableError)
    expect(signer._signTypedData).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('when buying a single item gaslessly', () => {
  it('reads the buyer nonce, signs off-chain and returns the relayed txHash', async () => {
    const fetchMock = stubFetch({ ok: true, txHash: '0xrelayed' })
    const signer = makeSigner(async () => '0xdead')

    const hash = await buyGasless({
      trade: fakeTrade('0xmarket'),
      buyer: BUYER,
      signer,
      credits: [credit(B32('1'), '100')],
      maxCreditedValue: '100'
    })

    expect(hash).toBe('0xrelayed')
    expect(nonceMock).toHaveBeenCalledWith(BUYER)
    expect(signer._signTypedData).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('signs the DCL meta-tx over the buyer nonce with a bytes32(chainId) salt', async () => {
    stubFetch({ txHash: '0xrelayed' })
    let seen: { domain: any; types: any; message: any } | undefined
    const signer = makeSigner(async (domain, types, message) => {
      seen = { domain, types, message: message as any }
      return '0xdead'
    })

    await buyGasless({
      trade: fakeTrade('0xmarket'),
      buyer: BUYER,
      signer,
      credits: [credit(B32('1'), '100')],
      maxCreditedValue: '100'
    })

    expect(seen!.message).toMatchObject({ nonce: '7', from: BUYER })
    expect(seen!.message.functionData.startsWith('0x')).toBe(true)
    expect(seen!.types).toHaveProperty('MetaTransaction')
    // salt is bytes32(chainId) — 80002 = 0x1388e right-aligned in 32 bytes.
    expect(seen!.domain.salt).toBe('0x' + '0'.repeat(59) + '13882')
    expect(seen!.domain.verifyingContract).toBe('0x' + 'cc'.repeat(20))
  })

  it('POSTs executeMetaTransaction calldata to the relayer /transactions endpoint', async () => {
    const fetchMock = stubFetch({ txHash: '0xrelayed' })
    const signer = makeSigner(async () => '0xdead')

    await buyGasless({
      trade: fakeTrade('0xmarket'),
      buyer: BUYER,
      signer,
      credits: [credit(B32('1'), '100')],
      maxCreditedValue: '100'
    })

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://relayer.test/v1/transactions')
    expect(init.method).toBe('POST')
    const sent = JSON.parse(init.body as string)
    expect(sent.transactionData.from).toBe(BUYER)
    // params: [creditsManagerAddress, executeMetaTransaction(...) calldata]
    expect(sent.transactionData.params[0]).toBe('0x' + 'cc'.repeat(20))
    // 0xd8ed1acc is executeMetaTransaction's selector.
    expect(sent.transactionData.params[1].startsWith('0xd8ed1acc')).toBe(true)
  })

  it('throws when there are no credits to spend', async () => {
    const signer = makeSigner(async () => '0xdead')
    await expect(
      buyGasless({ trade: fakeTrade('0xmarket'), buyer: BUYER, signer, credits: [], maxCreditedValue: '0' })
    ).rejects.toThrow('No credits to spend')
  })
})

describe('when the buyer wallet cannot sign off-chain', () => {
  it('maps a non-denial signing failure to a contract-account GaslessUnavailableError', async () => {
    stubFetch({ txHash: '0xrelayed' })
    const signer = makeSigner(async () => {
      throw new Error('method not supported by this account')
    })
    await expect(
      buyGasless({ trade: fakeTrade('0xmarket'), buyer: BUYER, signer, credits: [credit(B32('1'), '100')], maxCreditedValue: '100' })
    ).rejects.toMatchObject({ name: 'GaslessUnavailableError', reason: 'contract-account' })
  })

  it('maps a user-denied signature to an unknown-reason GaslessUnavailableError', async () => {
    stubFetch({ txHash: '0xrelayed' })
    const signer = makeSigner(async () => {
      throw new Error('user denied message signature')
    })
    await expect(
      buyGasless({ trade: fakeTrade('0xmarket'), buyer: BUYER, signer, credits: [credit(B32('1'), '100')], maxCreditedValue: '100' })
    ).rejects.toMatchObject({ name: 'GaslessUnavailableError', reason: 'unknown' })
  })
})

describe('when the relayer fails', () => {
  it('wraps a non-ok relayer response as a relayer GaslessUnavailableError', async () => {
    stubFetch({ message: 'over capacity' }, false, 503)
    const signer = makeSigner(async () => '0xdead')
    await expect(
      buyGasless({ trade: fakeTrade('0xmarket'), buyer: BUYER, signer, credits: [credit(B32('1'), '100')], maxCreditedValue: '100' })
    ).rejects.toMatchObject({ reason: 'relayer', message: 'over capacity' })
  })

  it('rejects when the relayer returns ok but no txHash', async () => {
    stubFetch({ ok: true })
    const signer = makeSigner(async () => '0xdead')
    await expect(
      buyGasless({ trade: fakeTrade('0xmarket'), buyer: BUYER, signer, credits: [credit(B32('1'), '100')], maxCreditedValue: '100' })
    ).rejects.toMatchObject({ reason: 'relayer' })
  })

  it('rejects when the relayer body reports ok:false', async () => {
    stubFetch({ ok: false, message: 'nonce too low' })
    const signer = makeSigner(async () => '0xdead')
    await expect(
      buyGasless({ trade: fakeTrade('0xmarket'), buyer: BUYER, signer, credits: [credit(B32('1'), '100')], maxCreditedValue: '100' })
    ).rejects.toMatchObject({ reason: 'relayer', message: 'nonce too low' })
  })

  it('wraps a network-level fetch failure as a relayer GaslessUnavailableError', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('ECONNREFUSED')
    })
    vi.stubGlobal('fetch', fetchMock)
    const signer = makeSigner(async () => '0xdead')
    await expect(
      buyGasless({ trade: fakeTrade('0xmarket'), buyer: BUYER, signer, credits: [credit(B32('1'), '100')], maxCreditedValue: '100' })
    ).rejects.toMatchObject({ reason: 'relayer', message: 'ECONNREFUSED' })
  })
})

describe('when batch buying gaslessly', () => {
  it('groups trades on the same marketplace into one meta-tx and one signature', async () => {
    const fetchMock = stubFetch({ txHash: '0xrelayed' })
    const signer = makeSigner(async () => '0xdead')
    const purchases: CreditPurchase[] = [
      { trade: fakeTrade('0xMarket'), credits: [credit(B32('1'), '100')], maxCreditedValue: '100' },
      { trade: fakeTrade('0xmarket'), credits: [credit(B32('2'), '200')], maxCreditedValue: '200' }
    ]

    const hashes = await buyManyGasless({ purchases, buyer: BUYER, signer })

    // Both contracts lower-case to the same key → one group → one relay + one signature.
    expect(hashes).toEqual(['0xrelayed'])
    expect(signer._signTypedData).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('splits trades across different marketplaces into one meta-tx each', async () => {
    const fetchMock = stubFetch({ txHash: '0xrelayed' })
    const signer = makeSigner(async () => '0xdead')
    const purchases: CreditPurchase[] = [
      { trade: fakeTrade('0xmarketa'), credits: [credit(B32('1'), '100')], maxCreditedValue: '100' },
      { trade: fakeTrade('0xmarketb'), credits: [credit(B32('2'), '200')], maxCreditedValue: '200' }
    ]

    const hashes = await buyManyGasless({ purchases, buyer: BUYER, signer })

    expect(hashes).toEqual(['0xrelayed', '0xrelayed'])
    expect(signer._signTypedData).toHaveBeenCalledTimes(2)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('throws when there are no items to buy', async () => {
    const signer = makeSigner(async () => '0xdead')
    await expect(buyManyGasless({ purchases: [], buyer: BUYER, signer })).rejects.toThrow('No items to buy')
  })
})

describe('when waiting for settlement of a relayed tx', () => {
  it('resolves once the receipt lands with status 1', async () => {
    waitForTransactionMock.mockResolvedValueOnce({ status: 1 })
    await expect(waitForSettlement('0xhash')).resolves.toBeUndefined()
    expect(waitForTransactionMock).toHaveBeenCalledWith('0xhash', 1, 120_000)
  })

  it('honours a custom timeout', async () => {
    waitForTransactionMock.mockResolvedValueOnce({ status: 1 })
    await waitForSettlement('0xhash', { timeoutMs: 5_000 })
    expect(waitForTransactionMock).toHaveBeenCalledWith('0xhash', 1, 5_000)
  })

  it('throws when the receipt reports a failed status', async () => {
    waitForTransactionMock.mockResolvedValueOnce({ status: 0 })
    await expect(waitForSettlement('0xhash')).rejects.toThrow('Purchase did not confirm')
  })

  it('throws when no receipt is returned', async () => {
    waitForTransactionMock.mockResolvedValueOnce(null)
    await expect(waitForSettlement('0xhash')).rejects.toThrow('Purchase did not confirm')
  })
})

describe('GaslessUnavailableError', () => {
  it('defaults its reason to unknown', () => {
    const err = new GaslessUnavailableError('boom')
    expect(err.reason).toBe('unknown')
    expect(err.name).toBe('GaslessUnavailableError')
    expect(err).toBeInstanceOf(Error)
  })

  it('carries the reason it was constructed with', () => {
    expect(new GaslessUnavailableError('x', 'relayer').reason).toBe('relayer')
  })
})
