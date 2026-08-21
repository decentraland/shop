import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TradeAssetType, type Trade } from '@dcl/schemas'
import type { ethers as Ethers } from 'ethers'

// Mutable flag/relayer, ABIs and programmable on-chain read stubs. vi.hoisted lets the vi.mock
// factories (hoisted to the top of the file) safely reference these shared handles.
const {
  gasless,
  nonceMock,
  nonceState,
  bnLike,
  waitForTransactionMock,
  CM_ABI,
  MARKET_ABI,
  STORE_ABI,
  MetaTxError,
  ErrCode
} = vi.hoisted(() => {
  // Minimal stand-ins for decentraland-transactions' MetaTransactionError / ErrorCode so buy-gasless's
  // `new MetaTransactionError(msg, ErrorCode.USER_DENIED)` resolves against the mock.
  class MetaTxError extends Error {
    code: string
    constructor(message: string, code: string) {
      super(message)
      this.name = 'MetaTransactionError'
      this.code = code
    }
  }
  const bnLike = (n: number) => ({
    toString: () => String(n),
    gt: (other: { toString(): string }) => n > Number(other.toString())
  })
  const nonceState = { next: 7 }
  return {
    gasless: { enabled: true, relayerUrl: 'https://relayer.test/v1' },
    MetaTxError,
    ErrCode: { USER_DENIED: 'USER_DENIED' },
    // getNonce(buyer) → a BigNumber-like value: the target reads .toString() to sign and .gt() to
    // check whether a relayed group has consumed the nonce it signed.
    bnLike,
    // The nonce ADVANCES on every read by default, because that is what the chain does once a relayed
    // transaction lands. A constant would leave a multi-group basket waiting for a nonce that never moves.
    nonceState,
    nonceMock: vi.fn(async (_user: string) => bnLike(nonceState.next++)),
    // waitForTransaction(hash, confirmations, timeout) → a receipt-like value (only .status is read).
    waitForTransactionMock: vi.fn(async (..._args: unknown[]): Promise<{ status: number } | null> => ({ status: 1 })),
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
    ],
    // The CollectionStore's `buy` fragment, so a MINT's calldata encodes for real too.
    STORE_ABI: [
      'function buy(tuple(address collection,uint256[] ids,uint256[] prices,address[] beneficiaries)[] itemsToBuy)'
    ]
  }
})

vi.mock('~/lib/gasless-config', () => ({
  gaslessConfig: gasless,
  gaslessEnabled: () => gasless.enabled
}))

vi.mock('~/config', () => ({ config: { rpcUrl: 'http://localhost', chainId: 80002 } }))

vi.mock('decentraland-transactions', () => ({
  ContractName: { CreditsManager: 'CreditsManager', CollectionStore: 'CollectionStore' },
  getContractName: () => 'DecentralandMarketplacePolygon',
  getContract: (name: string) =>
    name === 'CreditsManager'
      ? { address: '0x' + 'cc'.repeat(20), name: 'CreditsManager', version: '1', abi: CM_ABI }
      : name === 'CollectionStore'
        ? { address: '0x' + 'ff'.repeat(20), name: 'CollectionStore', version: '1', abi: STORE_ABI }
        : { address: '0x' + 'ee'.repeat(20), name: 'DecentralandMarketplacePolygon', version: '1', abi: MARKET_ABI },
  MetaTransactionError: MetaTxError,
  ErrorCode: ErrCode
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

import {
  GaslessUnavailableError,
  SettlementPendingError,
  buyGasless,
  buyOneGasless,
  buyManyGasless,
  waitForSettlement,
  waitForNonceAdvance
} from '~/lib/buy-gasless'
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

// A CollectionStore mint line: an item to mint, its price, and the credit paying for it.
function storePurchase(saltNum: string) {
  return {
    kind: 'store' as const,
    chainId: 80002,
    item: { collection: '0x' + 'ab'.repeat(20), itemId: '0', priceWei: '100' },
    credits: [credit(B32(saltNum), '100')],
    maxCreditedValue: '100'
  }
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
  nonceState.next = 7
  nonceMock.mockImplementation(async () => bnLike(nonceState.next++))
  waitForTransactionMock.mockClear()
  waitForTransactionMock.mockResolvedValue({ status: 1 })
  vi.unstubAllGlobals()
  // The nonce wait sleeps between polls, so a few specs drive the clock themselves. Reset it here rather
  // than in each of them, so a failure mid-test cannot leave fake timers installed for everything after.
  vi.useRealTimers()
})

describe('when the gasless feature flag is off', () => {
  beforeEach(() => {
    gasless.enabled = false
  })

  it('rejects a single buy with a disabled GaslessUnavailableError', async () => {
    const signer = makeSigner(
      async () =>
        '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa11111111111111111111111111111111111111111111111111111111111111111b'
    )
    await expect(
      buyGasless({
        trade: fakeTrade('0xmarket'),
        buyer: BUYER,
        signer,
        credits: [credit(B32('1'), '100')],
        maxCreditedValue: '100'
      })
    ).rejects.toMatchObject({ name: 'GaslessUnavailableError', reason: 'disabled' })
  })

  it('rejects a batch buy with a disabled GaslessUnavailableError', async () => {
    const signer = makeSigner(
      async () =>
        '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa11111111111111111111111111111111111111111111111111111111111111111b'
    )
    const purchases: CreditPurchase[] = [
      { trade: fakeTrade('0xmarket'), credits: [credit(B32('1'), '100')], maxCreditedValue: '100' }
    ]
    await expect(buyManyGasless({ purchases, buyer: BUYER, signer })).rejects.toBeInstanceOf(GaslessUnavailableError)
  })

  it('does not sign or hit the relayer when disabled', async () => {
    const fetchMock = stubFetch({ txHash: '0xabc' })
    const signer = makeSigner(
      async () =>
        '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa11111111111111111111111111111111111111111111111111111111111111111b'
    )
    await expect(
      buyGasless({
        trade: fakeTrade('0xmarket'),
        buyer: BUYER,
        signer,
        credits: [credit(B32('1'), '100')],
        maxCreditedValue: '100'
      })
    ).rejects.toBeInstanceOf(GaslessUnavailableError)
    expect(signer._signTypedData).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

/**
 * Relaying ONE purchase of either kind — what the item page's Buy now submits.
 *
 * Gasless is the default rail, so a mint that could not be relayed could not be bought from the item page at
 * all by the buyers this shop is for: a managed wallet holds no POL, and the gas-paying fallback is refused for
 * it on purpose.
 */
describe('when relaying a single purchase of either kind', () => {
  it('relays a MINT, targeting the CollectionStore', async () => {
    const fetchMock = stubFetch({ ok: true, txHash: '0xmint' })
    const signer = makeSigner(
      async () =>
        '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa11111111111111111111111111111111111111111111111111111111111111111b'
    )

    const hash = await buyOneGasless({ purchase: storePurchase('1'), buyer: BUYER, signer })

    expect(hash).toBe('0xmint')
    expect(signer._signTypedData).toHaveBeenCalledTimes(1) // an off-chain signature, not a transaction
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('relays a LISTING the same way', async () => {
    stubFetch({ ok: true, txHash: '0xrelayed' })
    const signer = makeSigner(
      async () =>
        '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa11111111111111111111111111111111111111111111111111111111111111111b'
    )

    const hash = await buyOneGasless({
      purchase: {
        kind: 'trade',
        trade: fakeTrade('0xmarket'),
        credits: [credit(B32('1'), '100')],
        maxCreditedValue: '100'
      },
      buyer: BUYER,
      signer
    })

    expect(hash).toBe('0xrelayed')
  })

  it('refuses a purchase with no credits, before signing anything', async () => {
    const fetchMock = stubFetch({ txHash: '0xmint' })
    const signer = makeSigner(
      async () =>
        '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa11111111111111111111111111111111111111111111111111111111111111111b'
    )

    await expect(
      buyOneGasless({ purchase: { ...storePurchase('1'), credits: [] }, buyer: BUYER, signer })
    ).rejects.toThrow('No credits to spend')
    expect(signer._signTypedData).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('when buying a single item gaslessly', () => {
  it('normalizes a v=0 wallet signature to 27 before relaying', async () => {
    // Some wallets return the recovery id as 0/1 instead of 27/28. The CreditsManager recovers with
    // OpenZeppelin's ECDSA, which reverts with ECDSAInvalidSignature() on anything else — the relayer
    // then fails gas estimation and the buyer, who has already signed, gets nothing. Reproduces a real
    // failed purchase (revert data 0xf645eedf).
    const r = 'a'.repeat(64)
    const s = '1'.repeat(64)
    const fetchMock = stubFetch({ txHash: '0xabc' })
    const signer = makeSigner(async () => `0x${r}${s}00`)

    await buyGasless({
      trade: fakeTrade('0xmarket'),
      buyer: BUYER,
      signer,
      credits: [credit(B32('1'), '100')],
      maxCreditedValue: '100'
    })

    // Assert on the whole relayed payload rather than a specific field: the point is that the
    // normalized signature reaches the wire, wherever the body happens to carry it.
    const relayed = JSON.stringify(fetchMock.mock.calls[0])
    // The wallet's `…00` must reach the contract as `…1b`, and the r/s halves must be untouched.
    expect(relayed).toContain(`${r}${s}1b`)
    expect(relayed).not.toContain(`${r}${s}00`)
  })

  it('reads the buyer nonce, signs off-chain and returns the relayed txHash', async () => {
    const fetchMock = stubFetch({ ok: true, txHash: '0xrelayed' })
    const signer = makeSigner(
      async () =>
        '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa11111111111111111111111111111111111111111111111111111111111111111b'
    )

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
      return '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa11111111111111111111111111111111111111111111111111111111111111111b'
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
    const signer = makeSigner(
      async () =>
        '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa11111111111111111111111111111111111111111111111111111111111111111b'
    )

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
    const signer = makeSigner(
      async () =>
        '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa11111111111111111111111111111111111111111111111111111111111111111b'
    )
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
      buyGasless({
        trade: fakeTrade('0xmarket'),
        buyer: BUYER,
        signer,
        credits: [credit(B32('1'), '100')],
        maxCreditedValue: '100'
      })
    ).rejects.toMatchObject({ name: 'GaslessUnavailableError', reason: 'contract-account' })
  })

  it('maps a user-denied signature to a USER_DENIED MetaTransactionError (never a gasless-unavailable fallback)', async () => {
    const fetchMock = stubFetch({ txHash: '0xrelayed' })
    const signer = makeSigner(async () => {
      throw Object.assign(new Error('user denied message signature'), { code: 4001 })
    })
    const run = () =>
      buyGasless({
        trade: fakeTrade('0xmarket'),
        buyer: BUYER,
        signer,
        credits: [credit(B32('1'), '100')],
        maxCreditedValue: '100'
      })
    // A dismissed prompt is a cancel, not a gasless-unavailable condition: callers only fall back to a
    // gas-paying direct tx on GaslessUnavailableError, so this must be a distinct rejection type that
    // propagates as a cancel — and it must never reach the relayer.
    await expect(run()).rejects.toBeInstanceOf(MetaTxError)
    await expect(run()).rejects.not.toBeInstanceOf(GaslessUnavailableError)
    await expect(run()).rejects.toMatchObject({ code: ErrCode.USER_DENIED })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('when the relayer fails', () => {
  it('wraps a non-ok relayer response as a relayer GaslessUnavailableError', async () => {
    stubFetch({ message: 'over capacity' }, false, 503)
    const signer = makeSigner(
      async () =>
        '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa11111111111111111111111111111111111111111111111111111111111111111b'
    )
    await expect(
      buyGasless({
        trade: fakeTrade('0xmarket'),
        buyer: BUYER,
        signer,
        credits: [credit(B32('1'), '100')],
        maxCreditedValue: '100'
      })
    ).rejects.toMatchObject({ reason: 'relayer-rejected', message: 'over capacity' })
  })

  it('rejects when the relayer returns ok but no txHash', async () => {
    stubFetch({ ok: true })
    const signer = makeSigner(
      async () =>
        '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa11111111111111111111111111111111111111111111111111111111111111111b'
    )
    await expect(
      buyGasless({
        trade: fakeTrade('0xmarket'),
        buyer: BUYER,
        signer,
        credits: [credit(B32('1'), '100')],
        maxCreditedValue: '100'
      })
    ).rejects.toMatchObject({ reason: 'relayer-rejected' })
  })

  it('rejects when the relayer body reports ok:false', async () => {
    stubFetch({ ok: false, message: 'nonce too low' })
    const signer = makeSigner(
      async () =>
        '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa11111111111111111111111111111111111111111111111111111111111111111b'
    )
    await expect(
      buyGasless({
        trade: fakeTrade('0xmarket'),
        buyer: BUYER,
        signer,
        credits: [credit(B32('1'), '100')],
        maxCreditedValue: '100'
      })
    ).rejects.toMatchObject({ reason: 'relayer-rejected', message: 'nonce too low' })
  })

  it('wraps a network-level fetch failure as a relayer GaslessUnavailableError', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('ECONNREFUSED')
    })
    vi.stubGlobal('fetch', fetchMock)
    const signer = makeSigner(
      async () =>
        '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa11111111111111111111111111111111111111111111111111111111111111111b'
    )
    await expect(
      buyGasless({
        trade: fakeTrade('0xmarket'),
        buyer: BUYER,
        signer,
        credits: [credit(B32('1'), '100')],
        maxCreditedValue: '100'
      })
      // A network fault leaves no usable response: the relayer may have submitted before the connection died,
      // so this reason must NOT be read as proof that nothing went out.
    ).rejects.toMatchObject({ reason: 'relayer-unreachable', message: 'ECONNREFUSED' })
  })
})

describe('when batch buying gaslessly', () => {
  it('groups trades on the same marketplace into one meta-tx and one signature', async () => {
    const fetchMock = stubFetch({ txHash: '0xrelayed' })
    const signer = makeSigner(
      async () =>
        '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa11111111111111111111111111111111111111111111111111111111111111111b'
    )
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
    const signer = makeSigner(
      async () =>
        '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa11111111111111111111111111111111111111111111111111111111111111111b'
    )
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
    const signer = makeSigner(
      async () =>
        '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa11111111111111111111111111111111111111111111111111111111111111111b'
    )
    await expect(buyManyGasless({ purchases: [], buyer: BUYER, signer })).rejects.toThrow('No items to buy')
  })

  /**
   * A CollectionStore MINT is relayed like anything else.
   *
   * It used to be excluded, which meant a basket containing one fell through to the buyer's own gas-paying
   * transaction — and that is not a route a web2 buyer has: no POL, no idea what Polygon is. The exclusion was
   * never a contract limitation. `useCredits` carries exactly one external call whichever rail it is, and the
   * store call names the buyer explicitly as the beneficiary, so relaying changes only who transmits and pays.
   */
  it('relays a store mint, so a buyer with no POL can still buy one', async () => {
    const fetchMock = stubFetch({ txHash: '0xmint' })
    const signer = makeSigner(
      async () =>
        '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa11111111111111111111111111111111111111111111111111111111111111111b'
    )

    const hashes = await buyManyGasless({ purchases: [storePurchase('1')], buyer: BUYER, signer })

    expect(hashes).toEqual(['0xmint'])
    expect(signer._signTypedData).toHaveBeenCalledTimes(1) // an off-chain signature, not a transaction
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('collapses several mints into ONE meta-tx, matching the direct rail’s grouping', async () => {
    const fetchMock = stubFetch({ txHash: '0xmint' })
    const signer = makeSigner(
      async () =>
        '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa11111111111111111111111111111111111111111111111111111111111111111b'
    )

    const hashes = await buyManyGasless({
      purchases: [storePurchase('1'), storePurchase('2')],
      buyer: BUYER,
      signer
    })

    // CollectionStore.buy takes an array across collections, so one call covers both.
    expect(hashes).toEqual(['0xmint'])
    expect(signer._signTypedData).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('relays a MIXED basket as one meta-tx per rail', async () => {
    const fetchMock = stubFetch({ txHash: '0xrelayed' })
    const signer = makeSigner(
      async () =>
        '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa11111111111111111111111111111111111111111111111111111111111111111b'
    )

    const hashes = await buyManyGasless({
      purchases: [
        {
          kind: 'trade' as const,
          trade: fakeTrade('0xmarket'),
          credits: [credit(B32('1'), '100')],
          maxCreditedValue: '100'
        },
        storePurchase('2')
      ],
      buyer: BUYER,
      signer
    })

    // Two rails cannot share one external call, so two signatures — the same split the direct rail makes.
    expect(hashes).toEqual(['0xrelayed', '0xrelayed'])
    expect(signer._signTypedData).toHaveBeenCalledTimes(2)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('reports each group’s credits with the hash that spent them', async () => {
    stubFetch({ txHash: '0xrelayed' })
    const signer = makeSigner(
      async () =>
        '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa11111111111111111111111111111111111111111111111111111111111111111b'
    )
    const onBroadcast = vi.fn()

    await buyManyGasless({ purchases: [storePurchase('9')], buyer: BUYER, signer, onBroadcast })

    // Pairing hash -> salts is what lets the caller tell WHICH group is unresolved instead of releasing
    // reservations for credits that are already spent on-chain.
    expect(onBroadcast).toHaveBeenCalledWith({ txHash: '0xrelayed', salts: [B32('9')] })
  })

  /**
   * The bug this pair of tests exists for.
   *
   * A basket of five mints plus two resales relayed the mints, signed the resales 0.6s later against the
   * nonce the mints had not consumed yet, and the relayer answered 400 — it rebuilds the digest from the
   * nonce IT reads, so a stale one recovers an unrelated address and the refusal reads as "signed by
   * somebody else". Nobody could have confirmed their way out of it: this rail never prompts.
   */
  it('signs each group against its own nonce, so the relayer can verify the second one too', async () => {
    stubFetch({ txHash: '0xrelayed' })
    // The real sequence: 7 when the first group is signed, then 8 once the chain has consumed it — so the
    // wait sees it move and the second group signs against 8.
    nonceMock.mockResolvedValueOnce(bnLike(7)).mockResolvedValue(bnLike(8))
    const seen: unknown[] = []
    const signer = makeSigner(async (_domain, _types, message) => {
      seen.push(message)
      return '0x' + 'aa'.repeat(32) + '11'.repeat(32) + '1b'
    })

    await buyManyGasless({
      purchases: [
        {
          kind: 'trade' as const,
          trade: fakeTrade('0xmarket'),
          credits: [credit(B32('1'), '100')],
          maxCreditedValue: '100'
        },
        storePurchase('2')
      ],
      buyer: BUYER,
      signer
    })

    expect(seen).toHaveLength(2)
    expect((seen[0] as { nonce: string }).nonce).toBe('7')
    // Not '7' again: the second signature is built after the contract has moved past the first.
    expect((seen[1] as { nonce: string }).nonce).toBe('8')
  })

  it('waits for the relayed group to be consumed before signing the next one', async () => {
    stubFetch({ txHash: '0xrelayed' })
    const order: string[] = []
    // Held at 7 for one poll, so the wait has to come back a second time before the next signature.
    nonceMock.mockImplementation(async () => {
      order.push('read')
      return bnLike(nonceMock.mock.calls.length >= 3 ? 8 : 7)
    })
    const signer = makeSigner(async () => {
      order.push('sign')
      return '0x' + 'aa'.repeat(32) + '11'.repeat(32) + '1b'
    })

    const purchases = [
      {
        kind: 'trade' as const,
        trade: fakeTrade('0xmarket'),
        credits: [credit(B32('1'), '100')],
        maxCreditedValue: '100'
      },
      storePurchase('2')
    ]

    vi.useFakeTimers()
    const buying = buyManyGasless({ purchases, buyer: BUYER, signer })
    await vi.advanceTimersByTimeAsync(2_000)
    await buying

    // read (group 1) → sign → read (not moved) → read (moved) → read (group 2's own) → sign
    expect(order).toEqual(['read', 'sign', 'read', 'read', 'read', 'sign'])
  })

  it('stops instead of signing a doomed signature when the relayed group never lands', async () => {
    stubFetch({ txHash: '0xstuck' })
    nonceMock.mockResolvedValue(bnLike(7)) // never advances
    const signer = makeSigner(async () => '0x' + 'aa'.repeat(32) + '11'.repeat(32) + '1b')
    const purchases = [
      {
        kind: 'trade' as const,
        trade: fakeTrade('0xmarket'),
        credits: [credit(B32('1'), '100')],
        maxCreditedValue: '100'
      },
      storePurchase('2')
    ]

    vi.useFakeTimers()
    const settled = expect(buyManyGasless({ purchases, buyer: BUYER, signer })).rejects.toBeInstanceOf(
      SettlementPendingError
    )
    await vi.advanceTimersByTimeAsync(121_000)
    await settled

    // SettlementPendingError and not GaslessUnavailableError: the first group IS broadcast, so its credits
    // must stay reserved and the caller must not retry the basket on the gas-paying rail.
    expect(signer._signTypedData).toHaveBeenCalledTimes(1)
  })

  /**
   * `config.rpcUrl` is a load-balanced gateway, so the read that builds the next signature can be answered
   * by a node that has not seen the block yet — which would undo the wait and reproduce the original 400.
   */
  it('signs the next group against the highest nonce seen, not a node that answers from behind', async () => {
    stubFetch({ txHash: '0xrelayed' })
    const seen: unknown[] = []
    const signer = makeSigner(async (_domain, _types, message) => {
      seen.push(message)
      return '0x' + 'aa'.repeat(32) + '11'.repeat(32) + '1b'
    })
    // group 1 reads 7 · the wait sees 8 · group 2's own read comes back STALE at 7
    nonceMock.mockResolvedValueOnce(bnLike(7)).mockResolvedValueOnce(bnLike(8)).mockResolvedValue(bnLike(7))

    await buyManyGasless({
      purchases: [
        {
          kind: 'trade' as const,
          trade: fakeTrade('0xmarket'),
          credits: [credit(B32('1'), '100')],
          maxCreditedValue: '100'
        },
        storePurchase('2')
      ],
      buyer: BUYER,
      signer
    })

    expect((seen[0] as { nonce: string }).nonce).toBe('7')
    // 8, not the 7 the lagging node reported: a nonce only grows, so a value already observed is a fact.
    expect((seen[1] as { nonce: string }).nonce).toBe('8')
  })

  it('reports settling progress between groups, and not after the last one', async () => {
    stubFetch({ txHash: '0xrelayed' })
    const signer = makeSigner(async () => '0x' + 'aa'.repeat(32) + '11'.repeat(32) + '1b')
    const onGroupSettling = vi.fn()

    await buyManyGasless({
      purchases: [
        {
          kind: 'trade' as const,
          trade: fakeTrade('0xmarket'),
          credits: [credit(B32('1'), '100')],
          maxCreditedValue: '100'
        },
        storePurchase('2')
      ],
      buyer: BUYER,
      signer,
      onGroupSettling
    })

    expect(onGroupSettling).toHaveBeenCalledTimes(1)
    expect(onGroupSettling).toHaveBeenCalledWith({ settled: 1, total: 2 })
  })
})

describe('when waiting for a relayed group to consume its nonce', () => {
  it('resolves as soon as the contract has moved past the signed nonce', async () => {
    nonceMock.mockResolvedValue(bnLike(9))

    await expect(
      waitForNonceAdvance({ chainId: 80002, buyer: BUYER, signedNonce: bnLike(8) as never })
    ).resolves.toMatchObject({ toString: expect.any(Function) })
    // The VALUE matters, not just the fact of an advance: the caller signs the next group against it.
    const seen = await waitForNonceAdvance({ chainId: 80002, buyer: BUYER, signedNonce: bnLike(8) as never })
    expect(seen?.toString()).toBe('9')
  })

  it('gives up rather than reporting an advance that did not happen', async () => {
    nonceMock.mockResolvedValue(bnLike(8))

    await expect(
      waitForNonceAdvance({ chainId: 80002, buyer: BUYER, signedNonce: bnLike(8) as never, timeoutMs: 0 })
    ).resolves.toBeNull()
  })

  it('keeps waiting through a failed read, since an RPC hiccup is not an answer', async () => {
    nonceMock.mockRejectedValueOnce(new Error('rpc down')).mockResolvedValue(bnLike(9))

    vi.useFakeTimers()
    const waiting = waitForNonceAdvance({ chainId: 80002, buyer: BUYER, signedNonce: bnLike(8) as never })
    await vi.advanceTimersByTimeAsync(2_000)

    expect((await waiting)?.toString()).toBe('9')
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

  it('throws a plain Error (safe to release) when the receipt reports a reverted status', async () => {
    waitForTransactionMock.mockResolvedValueOnce({ status: 0 })
    const err = await waitForSettlement('0xhash').catch(e => e)
    expect(err).toBeInstanceOf(Error)
    expect(err).not.toBeInstanceOf(SettlementPendingError)
    expect(err.message).toMatch(/reverted/)
  })

  it('throws SettlementPendingError (do NOT release) when no receipt lands within the window', async () => {
    waitForTransactionMock.mockResolvedValueOnce(null)
    const err = await waitForSettlement('0xhash').catch(e => e)
    expect(err).toBeInstanceOf(SettlementPendingError)
    expect(err.txHash).toBe('0xhash')
  })

  it('throws SettlementPendingError when waitForTransaction rejects on timeout (tx still in flight)', async () => {
    waitForTransactionMock.mockRejectedValueOnce(new Error('timeout exceeded'))
    const err = await waitForSettlement('0xhash').catch(e => e)
    expect(err).toBeInstanceOf(SettlementPendingError)
    expect(err.txHash).toBe('0xhash')
  })
})

describe('SettlementPendingError', () => {
  it('carries the broadcast txHash and is distinct from a hard failure', () => {
    const err = new SettlementPendingError('0xabc')
    expect(err.txHash).toBe('0xabc')
    expect(err.name).toBe('SettlementPendingError')
    expect(err).toBeInstanceOf(Error)
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
    expect(new GaslessUnavailableError('x', 'relayer-rejected').reason).toBe('relayer-rejected')
  })

  /**
   * The two relayer reasons are a MONEY distinction: only `relayer-rejected` proves nothing was broadcast, so
   * only it makes re-submitting the same credit on the direct rail safe. `relayer-unreachable` may follow a
   * submit that succeeded upstream.
   */
  it('separates a relayer refusal from an unreachable relayer', () => {
    expect(new GaslessUnavailableError('x', 'relayer-unreachable').reason).toBe('relayer-unreachable')
  })
})
