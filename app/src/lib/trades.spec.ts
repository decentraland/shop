import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ChainId, Network, TradeAssetType, TradeType, type TradeCreation } from '@dcl/schemas'

// Track calls into the mocked ethers Contract so we can assert on the on-chain paths without a chain.
const isApprovedForAllMock = vi.fn()
const setApprovalForAllMock = vi.fn()
const globalMintersMock = vi.fn()
const setMintersMock = vi.fn()
const contractSignatureIndexMock = vi.fn()
const signerSignatureIndexMock = vi.fn()
const jsonRpcProviderCtor = vi.fn()

// The signing helpers only need contract address/name/version; stub the package so its ESM/cross-chain
// deps don't get loaded when importing ~/lib/trades.
vi.mock('decentraland-transactions', () => ({
  ContractName: { OffChainMarketplaceV2: 'OffChainMarketplaceV2', MANAToken: 'MANAToken' },
  getContract: (name: string) => ({
    address:
      name === 'MANAToken'
        ? '0x0000000000000000000000000000000000000123'
        : '0x0000000000000000000000000000000000000000',
    name: 'DecentralandMarketplacePolygon',
    version: '1.0.0',
    abi: []
  })
}))

vi.mock('~/config', () => ({ config: { rpcUrl: 'http://localhost:9999' } }))

// Keep real ethers utils/BigNumber; swap Contract + JsonRpcProvider so nothing hits a chain.
vi.mock('ethers', async importOriginal => {
  const actual = await importOriginal<typeof import('ethers')>()

  // Dispatch by which ABI method the caller invokes. A single MockContract exposes every method
  // used across trades.ts; the delegating vi.fn()s let each test decide the on-chain response.
  class MockContract {
    address: string
    constructor(address: string, _abi: unknown, _providerOrSigner: unknown) {
      this.address = address
    }
    isApprovedForAll(...args: unknown[]) {
      return isApprovedForAllMock(...args)
    }
    setApprovalForAll(...args: unknown[]) {
      return setApprovalForAllMock(...args)
    }
    globalMinters(...args: unknown[]) {
      return globalMintersMock(...args)
    }
    setMinters(...args: unknown[]) {
      return setMintersMock(...args)
    }
    contractSignatureIndex(...args: unknown[]) {
      return contractSignatureIndexMock(...args)
    }
    signerSignatureIndex(...args: unknown[]) {
      return signerSignatureIndexMock(...args)
    }
  }

  class MockJsonRpcProvider {
    constructor(url: string) {
      jsonRpcProviderCtor(url)
    }
  }

  return {
    ethers: {
      ...actual.ethers,
      Contract: MockContract,
      providers: {
        ...actual.ethers.providers,
        JsonRpcProvider: MockJsonRpcProvider
      }
    }
  }
})

import {
  valueForAsset,
  generateTradeValues,
  ensureApproval,
  createUsdPeggedListing,
  isMarketplaceMinter,
  ensureMinter,
  createPrimaryUsdPeggedListing
} from '~/lib/trades'

const MARKET = '0x0000000000000000000000000000000000000000'
const MANA = '0x0000000000000000000000000000000000000123'
const SELLER = '0x00000000000000000000000000000000000000AA'
const NFT = '0x00000000000000000000000000000000000000BB'
const COLLECTION = '0x00000000000000000000000000000000000000CC'

// A signer whose on-chain send/network responses we can steer per test.
function makeSigner(overrides: Record<string, unknown> = {}) {
  const send = vi.fn().mockResolvedValue(undefined)
  const getNetwork = vi.fn().mockResolvedValue({ chainId: ChainId.MATIC_AMOY })
  const signTypedData = vi.fn().mockResolvedValue('0xdeadbeef')
  return {
    getAddress: vi.fn().mockResolvedValue(SELLER),
    _signTypedData: signTypedData,
    provider: { getNetwork, send },
    ...overrides
  } as any
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('when getting the signed value for a trade asset', () => {
  it('and the asset is USD-pegged MANA it should return the amount', () => {
    expect(valueForAsset({ assetType: TradeAssetType.USD_PEGGED_MANA, amount: '1000000000000000000' })).toBe(
      '1000000000000000000'
    )
  })

  it('and the asset is ERC20 it should return the amount', () => {
    expect(valueForAsset({ assetType: TradeAssetType.ERC20, amount: '777' })).toBe('777')
  })

  it('and the asset is ERC721 it should return the tokenId', () => {
    expect(valueForAsset({ assetType: TradeAssetType.ERC721, tokenId: '42' })).toBe('42')
  })

  it('and the asset is a collection item it should return the itemId', () => {
    expect(valueForAsset({ assetType: TradeAssetType.COLLECTION_ITEM, itemId: '7' })).toBe('7')
  })

  it('and the asset type is unsupported it should throw', () => {
    expect(() => valueForAsset({ assetType: 999 as unknown as TradeAssetType })).toThrow(/Unsupported assetType 999/)
  })
})

describe('when generating the trade values for a USD-pegged listing', () => {
  const trade: Omit<TradeCreation, 'signature'> = {
    signer: '0xseller',
    network: Network.MATIC,
    chainId: ChainId.MATIC_AMOY,
    type: TradeType.PUBLIC_NFT_ORDER,
    checks: {
      uses: 1,
      expiration: 2_000_000,
      effective: 1_000_000,
      salt: '0x',
      contractSignatureIndex: 0,
      signerSignatureIndex: 0,
      allowedRoot: '0x',
      externalChecks: []
    },
    sent: [{ assetType: TradeAssetType.ERC721, contractAddress: '0xnft', tokenId: '42', extra: '' }],
    received: [
      {
        assetType: TradeAssetType.USD_PEGGED_MANA,
        contractAddress: '0xmana',
        amount: '1000000000000000000',
        extra: '',
        beneficiary: '0xseller'
      }
    ]
  }

  it('should encode the USD-pegged amount as the signed received value', () => {
    const values = generateTradeValues(trade)
    expect(values.received[0].value).toBe('1000000000000000000')
    expect(values.received[0].assetType).toBe(TradeAssetType.USD_PEGGED_MANA)
    expect(values.received[0].beneficiary).toBe('0xseller')
  })

  it('should encode the ERC721 tokenId as the signed sent value', () => {
    const values = generateTradeValues(trade)
    expect(values.sent[0].value).toBe('42')
  })

  it('should convert expiration and effective from milliseconds to seconds', () => {
    const values = generateTradeValues(trade)
    expect(values.checks.expiration).toBe(2_000)
    expect(values.checks.effective).toBe(1_000)
  })

  it('should default an empty sent extra to 0x', () => {
    const values = generateTradeValues(trade)
    expect(values.sent[0].extra).toBe('0x')
  })

  it('should default an empty received extra to 0x', () => {
    const values = generateTradeValues(trade)
    expect(values.received[0].extra).toBe('0x')
  })

  it('should keep a provided sent extra intact', () => {
    const withExtra = {
      ...trade,
      sent: [{ ...trade.sent[0], extra: '0xabc' }]
    }
    expect(generateTradeValues(withExtra).sent[0].extra).toBe('0xabc')
  })

  it('should zero-pad the salt to 32 bytes', () => {
    const values = generateTradeValues(trade)
    expect(values.checks.salt).toBe('0x' + '0'.repeat(64))
  })

  it('should default a missing allowedRoot to a 32-byte zero word', () => {
    const values = generateTradeValues(trade)
    expect(values.checks.allowedRoot).toBe('0x' + '0'.repeat(64))
  })

  it('should default a missing externalChecks value to 0x and preserve required/selector', () => {
    const withCheck = {
      ...trade,
      checks: {
        ...trade.checks,
        externalChecks: [{ contractAddress: '0xext', selector: '0x12345678', value: '', required: true } as any]
      }
    }
    const values = generateTradeValues(withCheck)
    expect(values.checks.externalChecks[0].value).toBe('0x')
    expect(values.checks.externalChecks[0].required).toBe(true)
    expect(values.checks.externalChecks[0].selector).toBe('0x12345678')
  })

  it('should preserve a provided externalChecks value', () => {
    const withCheck = {
      ...trade,
      checks: {
        ...trade.checks,
        externalChecks: [{ contractAddress: '0xext', selector: '0x12345678', value: '0xff', required: false } as any]
      }
    }
    expect(generateTradeValues(withCheck).checks.externalChecks[0].value).toBe('0xff')
  })

  it('should tolerate a missing externalChecks array', () => {
    const noChecks = {
      ...trade,
      checks: { ...trade.checks, externalChecks: undefined as any }
    }
    expect(generateTradeValues(noChecks).checks.externalChecks).toEqual([])
  })
})

describe('when ensuring the marketplace is approved as operator', () => {
  it('should skip sending a tx when approval already exists', async () => {
    isApprovedForAllMock.mockResolvedValue(true)
    const signer = makeSigner()

    await ensureApproval({ signer, contractAddress: NFT, chainId: ChainId.MATIC_AMOY })

    expect(isApprovedForAllMock).toHaveBeenCalledWith(SELLER, MARKET)
    expect(setApprovalForAllMock).not.toHaveBeenCalled()
    expect(signer.provider.send).not.toHaveBeenCalled()
  })

  it('should send setApprovalForAll and wait when approval is missing', async () => {
    isApprovedForAllMock.mockResolvedValue(false)
    const wait = vi.fn().mockResolvedValue(undefined)
    setApprovalForAllMock.mockResolvedValue({ wait })
    const signer = makeSigner()

    await ensureApproval({ signer, contractAddress: NFT, chainId: ChainId.MATIC_AMOY })

    expect(setApprovalForAllMock).toHaveBeenCalledWith(MARKET, true)
    expect(wait).toHaveBeenCalledOnce()
  })

  it('should switch the wallet chain before approving when on the wrong network', async () => {
    isApprovedForAllMock.mockResolvedValue(false)
    setApprovalForAllMock.mockResolvedValue({ wait: vi.fn().mockResolvedValue(undefined) })
    const send = vi.fn().mockResolvedValue(undefined)
    const getNetwork = vi.fn().mockResolvedValue({ chainId: ChainId.ETHEREUM_MAINNET })
    const signer = makeSigner({ provider: { getNetwork, send } })

    await ensureApproval({ signer, contractAddress: NFT, chainId: ChainId.MATIC_AMOY })

    expect(send).toHaveBeenCalledWith('wallet_switchEthereumChain', [{ chainId: '0x13882' }])
  })

  it('should add the Amoy chain when switching fails with 4902', async () => {
    isApprovedForAllMock.mockResolvedValue(false)
    setApprovalForAllMock.mockResolvedValue({ wait: vi.fn().mockResolvedValue(undefined) })
    const send = vi.fn().mockRejectedValueOnce({ code: 4902 }).mockResolvedValueOnce(undefined)
    const getNetwork = vi.fn().mockResolvedValue({ chainId: ChainId.ETHEREUM_MAINNET })
    const signer = makeSigner({ provider: { getNetwork, send } })

    await ensureApproval({ signer, contractAddress: NFT, chainId: ChainId.MATIC_AMOY })

    expect(send).toHaveBeenNthCalledWith(2, 'wallet_addEthereumChain', expect.any(Array))
    const addCall = send.mock.calls[1][1][0]
    expect(addCall.chainId).toBe('0x13882')
  })

  it('should rethrow a non-4902 chain switch error', async () => {
    isApprovedForAllMock.mockResolvedValue(false)
    const send = vi.fn().mockRejectedValue({ code: 4001, message: 'user rejected' })
    const getNetwork = vi.fn().mockResolvedValue({ chainId: ChainId.ETHEREUM_MAINNET })
    const signer = makeSigner({ provider: { getNetwork, send } })

    await expect(ensureApproval({ signer, contractAddress: NFT, chainId: ChainId.MATIC_AMOY })).rejects.toMatchObject({
      code: 4001
    })
    expect(setApprovalForAllMock).not.toHaveBeenCalled()
  })

  it('should read approval from the target-chain RPC provider', async () => {
    isApprovedForAllMock.mockResolvedValue(true)
    await ensureApproval({ signer: makeSigner(), contractAddress: NFT, chainId: ChainId.MATIC_AMOY })
    expect(jsonRpcProviderCtor).toHaveBeenCalledWith('http://localhost:9999')
  })
})

describe('when creating a USD-pegged secondary listing', () => {
  beforeEach(() => {
    contractSignatureIndexMock.mockResolvedValue({ toNumber: () => 3 })
    signerSignatureIndexMock.mockResolvedValue({ toNumber: () => 7 })
  })

  it('should build a signed public_nft_order for the ERC721', async () => {
    const signer = makeSigner()
    const trade = await createUsdPeggedListing({
      signer,
      nft: { contractAddress: NFT, tokenId: '42', network: Network.MATIC, chainId: ChainId.MATIC_AMOY },
      usdPrice: 1,
      expiresAtMs: 2_000_000
    })

    expect(trade.type).toBe(TradeType.PUBLIC_NFT_ORDER)
    expect(trade.signer).toBe(SELLER.toLowerCase())
    expect(trade.signature).toBe('0xdeadbeef')
    expect(trade.sent[0].assetType).toBe(TradeAssetType.ERC721)
    expect((trade.sent[0] as any).tokenId).toBe('42')
    expect(trade.received[0].assetType).toBe(TradeAssetType.USD_PEGGED_MANA)
    expect(trade.received[0].contractAddress).toBe(MANA)
  })

  it('should convert the human USD price to wei on the received asset', async () => {
    const trade = await createUsdPeggedListing({
      signer: makeSigner(),
      nft: { contractAddress: NFT, tokenId: '42', network: Network.MATIC, chainId: ChainId.MATIC_AMOY },
      usdPrice: 2,
      expiresAtMs: 2_000_000
    })
    expect((trade.received[0] as any).amount).toBe('2000000000000000000')
  })

  it('should carry the on-chain signature indices into the checks', async () => {
    const trade = await createUsdPeggedListing({
      signer: makeSigner(),
      nft: { contractAddress: NFT, tokenId: '42', network: Network.MATIC, chainId: ChainId.MATIC_AMOY },
      usdPrice: 1,
      expiresAtMs: 2_000_000
    })
    expect(trade.checks.contractSignatureIndex).toBe(3)
    expect(trade.checks.signerSignatureIndex).toBe(7)
    expect(trade.checks.uses).toBe(1)
  })

  it('should pass the empty-string default fingerprint as the sent extra', async () => {
    const trade = await createUsdPeggedListing({
      signer: makeSigner(),
      nft: { contractAddress: NFT, tokenId: '42', network: Network.MATIC, chainId: ChainId.MATIC_AMOY },
      usdPrice: 1,
      expiresAtMs: 2_000_000
    })
    expect((trade.sent[0] as any).extra).toBe('')
  })

  it('should use a provided fingerprint as the sent extra', async () => {
    const trade = await createUsdPeggedListing({
      signer: makeSigner(),
      nft: { contractAddress: NFT, tokenId: '42', network: Network.MATIC, chainId: ChainId.MATIC_AMOY },
      usdPrice: 1,
      expiresAtMs: 2_000_000,
      fingerprint: '0xfp'
    })
    expect((trade.sent[0] as any).extra).toBe('0xfp')
  })

  it('should sign with the EIP-712 domain and the generated trade values', async () => {
    const signer = makeSigner()
    await createUsdPeggedListing({
      signer,
      nft: { contractAddress: NFT, tokenId: '42', network: Network.MATIC, chainId: ChainId.MATIC_AMOY },
      usdPrice: 1,
      expiresAtMs: 2_000_000
    })
    const [domain, types, message] = signer._signTypedData.mock.calls[0]
    expect(domain.verifyingContract).toBe(MARKET)
    expect(domain.name).toBe('DecentralandMarketplacePolygon')
    expect(types.Trade).toBeDefined()
    expect(message.received[0].value).toBe('1000000000000000000') // 1 USD → wei
  })

  it('should read the signature indices from the RPC provider, not the wallet', async () => {
    await createUsdPeggedListing({
      signer: makeSigner(),
      nft: { contractAddress: NFT, tokenId: '42', network: Network.MATIC, chainId: ChainId.MATIC_AMOY },
      usdPrice: 1,
      expiresAtMs: 2_000_000
    })
    expect(jsonRpcProviderCtor).toHaveBeenCalledWith('http://localhost:9999')
    expect(signerSignatureIndexMock).toHaveBeenCalledWith(SELLER.toLowerCase())
  })
})

describe('when checking whether the marketplace is a collection minter', () => {
  it('should return true when the collection reports the market as a global minter', async () => {
    globalMintersMock.mockResolvedValue(true)
    const result = await isMarketplaceMinter({ contractAddress: COLLECTION, chainId: ChainId.MATIC_AMOY })
    expect(result).toBe(true)
    expect(globalMintersMock).toHaveBeenCalledWith(MARKET)
  })

  it('should return false when the market is not a minter', async () => {
    globalMintersMock.mockResolvedValue(false)
    expect(await isMarketplaceMinter({ contractAddress: COLLECTION, chainId: ChainId.MATIC_AMOY })).toBe(false)
  })

  it('should return false when the read reverts', async () => {
    globalMintersMock.mockRejectedValue(new Error('revert'))
    expect(await isMarketplaceMinter({ contractAddress: COLLECTION, chainId: ChainId.MATIC_AMOY })).toBe(false)
  })
})

describe('when ensuring the marketplace is a minter', () => {
  it('should no-op when the market is already a minter', async () => {
    globalMintersMock.mockResolvedValue(true)
    const signer = makeSigner()

    await ensureMinter({ signer, contractAddress: COLLECTION, chainId: ChainId.MATIC_AMOY })

    expect(setMintersMock).not.toHaveBeenCalled()
    expect(signer.provider.send).not.toHaveBeenCalled()
  })

  it('should grant mint rights and wait when the market is not yet a minter', async () => {
    globalMintersMock.mockResolvedValue(false)
    const wait = vi.fn().mockResolvedValue(undefined)
    setMintersMock.mockResolvedValue({ wait })
    const signer = makeSigner()

    await ensureMinter({ signer, contractAddress: COLLECTION, chainId: ChainId.MATIC_AMOY })

    expect(setMintersMock).toHaveBeenCalledWith([MARKET], [true])
    expect(wait).toHaveBeenCalledOnce()
  })

  it('should treat a reverted read as not-yet-minter and grant rights', async () => {
    globalMintersMock.mockRejectedValue(new Error('revert'))
    const wait = vi.fn().mockResolvedValue(undefined)
    setMintersMock.mockResolvedValue({ wait })

    await ensureMinter({ signer: makeSigner(), contractAddress: COLLECTION, chainId: ChainId.MATIC_AMOY })

    expect(setMintersMock).toHaveBeenCalledOnce()
  })

  it('should switch the wallet to the collection chain before granting when on the wrong network', async () => {
    globalMintersMock.mockResolvedValue(false)
    setMintersMock.mockResolvedValue({ wait: vi.fn().mockResolvedValue(undefined) })
    const send = vi.fn().mockResolvedValue(undefined)
    const getNetwork = vi.fn().mockResolvedValue({ chainId: ChainId.ETHEREUM_MAINNET })
    const signer = makeSigner({ provider: { getNetwork, send } })

    await ensureMinter({ signer, contractAddress: COLLECTION, chainId: ChainId.MATIC_AMOY })

    expect(send).toHaveBeenCalledWith('wallet_switchEthereumChain', [{ chainId: '0x13882' }])
  })
})

describe('when creating a USD-pegged primary (mint) listing', () => {
  beforeEach(() => {
    contractSignatureIndexMock.mockResolvedValue({ toNumber: () => 1 })
    signerSignatureIndexMock.mockResolvedValue({ toNumber: () => 2 })
  })

  it('should build a signed public_item_order for the collection item', async () => {
    const trade = await createPrimaryUsdPeggedListing({
      signer: makeSigner(),
      item: { contractAddress: COLLECTION, itemId: '5', network: Network.MATIC, chainId: ChainId.MATIC_AMOY },
      usdPrice: 3,
      expiresAtMs: 2_000_000
    })

    expect(trade.type).toBe(TradeType.PUBLIC_ITEM_ORDER)
    expect(trade.sent[0].assetType).toBe(TradeAssetType.COLLECTION_ITEM)
    expect((trade.sent[0] as any).itemId).toBe('5')
    expect((trade.received[0] as any).amount).toBe('3000000000000000000')
    expect(trade.signature).toBe('0xdeadbeef')
  })

  it('should default uses to 1 when not provided', async () => {
    const trade = await createPrimaryUsdPeggedListing({
      signer: makeSigner(),
      item: { contractAddress: COLLECTION, itemId: '5', network: Network.MATIC, chainId: ChainId.MATIC_AMOY },
      usdPrice: 1,
      expiresAtMs: 2_000_000
    })
    expect(trade.checks.uses).toBe(1)
  })

  it('should floor and clamp a fractional uses to at least 1', async () => {
    const trade = await createPrimaryUsdPeggedListing({
      signer: makeSigner(),
      item: { contractAddress: COLLECTION, itemId: '5', network: Network.MATIC, chainId: ChainId.MATIC_AMOY },
      usdPrice: 1,
      expiresAtMs: 2_000_000,
      uses: 0
    })
    expect(trade.checks.uses).toBe(1)
  })

  it('should honor a supply-sized uses value', async () => {
    const trade = await createPrimaryUsdPeggedListing({
      signer: makeSigner(),
      item: { contractAddress: COLLECTION, itemId: '5', network: Network.MATIC, chainId: ChainId.MATIC_AMOY },
      usdPrice: 1,
      expiresAtMs: 2_000_000,
      uses: 10.9
    })
    expect(trade.checks.uses).toBe(10)
  })

  it('should carry the signature indices and beneficiary from the creator', async () => {
    const trade = await createPrimaryUsdPeggedListing({
      signer: makeSigner(),
      item: { contractAddress: COLLECTION, itemId: '5', network: Network.MATIC, chainId: ChainId.MATIC_AMOY },
      usdPrice: 1,
      expiresAtMs: 2_000_000
    })
    expect(trade.checks.contractSignatureIndex).toBe(1)
    expect(trade.checks.signerSignatureIndex).toBe(2)
    expect((trade.received[0] as any).beneficiary).toBe(SELLER.toLowerCase())
    expect(trade.signer).toBe(SELLER.toLowerCase())
  })

  it('should sign with the primary EIP-712 message encoding the collection item value', async () => {
    const signer = makeSigner()
    await createPrimaryUsdPeggedListing({
      signer,
      item: { contractAddress: COLLECTION, itemId: '5', network: Network.MATIC, chainId: ChainId.MATIC_AMOY },
      usdPrice: 1,
      expiresAtMs: 2_000_000
    })
    const [, , message] = signer._signTypedData.mock.calls[0]
    expect(message.sent[0].value).toBe('5')
    expect(message.sent[0].assetType).toBe(TradeAssetType.COLLECTION_ITEM)
  })
})
