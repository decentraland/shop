import { describe, it, expect, vi } from 'vitest'
import { ChainId, Network, TradeAssetType, TradeType, type TradeCreation } from '@dcl/schemas'

// The pure signing helpers don't touch contract config; stub the package so its ESM/cross-chain
// deps don't get loaded when importing ~/lib/trades.
vi.mock('decentraland-transactions', () => ({
  ContractName: { OffChainMarketplaceV2: 'OffChainMarketplaceV2', MANAToken: 'MANAToken' },
  getContract: () => ({ address: '0x0000000000000000000000000000000000000000', name: 'DecentralandMarketplacePolygon', version: '1.0.0', abi: [] })
}))

// eslint-disable-next-line import/first
import { valueForAsset, generateTradeValues } from '~/lib/trades'

describe('when getting the signed value for a trade asset', () => {
  it('and the asset is USD-pegged MANA it should return the amount', () => {
    expect(valueForAsset({ assetType: TradeAssetType.USD_PEGGED_MANA, amount: '1000000000000000000' })).toBe(
      '1000000000000000000'
    )
  })

  it('and the asset is ERC721 it should return the tokenId', () => {
    expect(valueForAsset({ assetType: TradeAssetType.ERC721, tokenId: '42' })).toBe('42')
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
})
