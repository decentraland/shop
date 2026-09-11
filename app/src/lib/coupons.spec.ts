import { describe, it, expect, vi } from 'vitest'
import { ethers } from 'ethers'
import { ChainId } from '@dcl/schemas'
import {
  collectionsRoot,
  couponDomain,
  couponTypedValues,
  couponTypes,
  createCollectionSale,
  encodeCouponData,
  getCouponContracts,
  isSaleCapped,
  liveSaleStatus,
  SaleInputError,
  UNCAPPED_USES,
  validateSaleTerms,
  type SaleInputProblem,
  type SaleTerms
} from './coupons'

vi.mock('~/lib/authorizations', () => ({ readProvider: () => ({}) }))
vi.mock('~/lib/network', () => ({ requireChain: async () => undefined }))

const COLLECTIONS = ['0x4c09495cd2d4e3d3fa2808eb655d013de426157b', '0xb0d0d31910da4a14d4e05a9d51b6e9a99a85d676']
const DAY = 24 * 60 * 60 * 1000

describe('collectionsRoot', () => {
  it('hashes a single collection the way the contract does: keccak256 of keccak256(abi.encode(address))', () => {
    const [collection] = COLLECTIONS
    const leaf = ethers.utils.keccak256(
      ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(['address'], [collection]))
    )
    expect(collectionsRoot([collection])).toBe(leaf)
  })

  it('is the same root whatever the order, casing or duplicates', () => {
    const shouted = [...COLLECTIONS].reverse().map(c => c.toUpperCase().replace('0X', '0x'))
    expect(collectionsRoot([...shouted, COLLECTIONS[0]])).toBe(collectionsRoot(COLLECTIONS))
  })

  it('refuses an empty set', () => {
    expect(() => collectionsRoot([])).toThrow(SaleInputError)
  })
})

describe('getCouponContracts', () => {
  it('returns the Polygon mainnet pair through the registry fallback, with an ABI', () => {
    const contracts = getCouponContracts(ChainId.MATIC_MAINNET)
    expect(contracts?.couponManager.address).toBe('0x3fd3056ee72a2a85e9392fab3a450e7736536081')
    expect(contracts?.collectionDiscountCoupon).toBe('0xc914507fe297b2dddd1232ac3a8903f1c125e794')
    expect(Array.isArray(contracts?.couponManager.abi)).toBe(true)
  })

  it('returns the Amoy pair from the library', () => {
    expect(getCouponContracts(ChainId.MATIC_AMOY)?.couponManager.address).toBe(
      '0x6c956587d9fe70032781edcdc626310648575382'
    )
  })

  it('has nothing for a chain without collections', () => {
    expect(getCouponContracts(ChainId.ETHEREUM_MAINNET)).toBeNull()
  })
})

describe('validateSaleTerms', () => {
  const now = 1_700_000_000_000
  const ok = { collections: COLLECTIONS, discountPct: 30, endsAtMs: now + 3 * DAY }

  it('accepts a plain 3-day sale', () => {
    expect(() => validateSaleTerms(ok, now)).not.toThrow()
  })

  const rejected: Array<[SaleInputProblem, SaleTerms]> = [
    ['pct', { ...ok, discountPct: 4 }],
    ['pct', { ...ok, discountPct: 71 }],
    ['pct', { ...ok, discountPct: 12.5 }],
    ['window', { ...ok, endsAtMs: now - 1 }],
    ['window', { ...ok, startsAtMs: now + 4 * DAY }],
    ['duration', { ...ok, endsAtMs: now + 31 * DAY }],
    ['collections', { ...ok, collections: [] }],
    ['uses', { ...ok, uses: 0 }],
    ['uses', { ...ok, uses: 2.5 }]
  ]

  it.each(rejected)('rejects %s', (problem, terms) => {
    expect(() => validateSaleTerms(terms, now)).toThrow(expect.objectContaining({ problem }))
  })

  it('measures the 30 days from a scheduled start, not from today', () => {
    expect(() => validateSaleTerms({ ...ok, startsAtMs: now + 10 * DAY, endsAtMs: now + 40 * DAY }, now)).not.toThrow()
  })
})

describe('createCollectionSale', () => {
  const chainId = ChainId.MATIC_MAINNET
  const wallet = ethers.Wallet.createRandom()
  const now = 1_700_000_000_000
  const readIndexes = vi.fn().mockResolvedValue({ contractSignatureIndex: 0, signerSignatureIndex: 2 })

  it('signs the coupon the CouponManager verifies and returns the payload the server takes', async () => {
    const payload = await createCollectionSale(
      { signer: wallet, chainId, collections: COLLECTIONS, discountPct: 30, endsAtMs: now + 2 * DAY },
      { readIndexes, now: () => now }
    )

    expect(payload).toMatchObject({
      signer: wallet.address.toLowerCase(),
      chainId,
      discountType: 1,
      discount: 300_000,
      collections: COLLECTIONS,
      couponAddress: '0xc914507fe297b2dddd1232ac3a8903f1c125e794'
    })
    expect(payload.checks).toMatchObject({
      uses: UNCAPPED_USES,
      effective: now,
      expiration: now + 2 * DAY,
      signerSignatureIndex: 2
    })
    expect(readIndexes).toHaveBeenCalledWith('0x3fd3056ee72a2a85e9392fab3a450e7736536081', wallet.address.toLowerCase())

    const contracts = getCouponContracts(chainId)!
    const data = encodeCouponData(payload.discount, collectionsRoot(payload.collections))
    const recovered = ethers.utils.verifyTypedData(
      couponDomain(chainId, contracts),
      couponTypes(),
      couponTypedValues(payload.checks, payload.couponAddress, data),
      payload.signature
    )
    expect(recovered.toLowerCase()).toBe(wallet.address.toLowerCase())
  })

  it('carries a scheduled start and a unit cap into the signed checks', async () => {
    const payload = await createCollectionSale(
      {
        signer: wallet,
        chainId,
        collections: COLLECTIONS,
        discountPct: 20,
        startsAtMs: now + DAY,
        endsAtMs: now + 3 * DAY,
        uses: 50
      },
      { readIndexes, now: () => now }
    )
    expect(payload.checks).toMatchObject({ uses: 50, effective: now + DAY })
    expect(isSaleCapped({ checks: payload.checks })).toBe(true)
  })

  it('refuses bad terms before asking for a signature', async () => {
    const sign = vi.spyOn(wallet, '_signTypedData')
    await expect(
      createCollectionSale(
        { signer: wallet, chainId, collections: COLLECTIONS, discountPct: 90, endsAtMs: now + DAY },
        { readIndexes, now: () => now }
      )
    ).rejects.toThrow(SaleInputError)
    expect(sign).not.toHaveBeenCalled()
  })
})

describe('liveSaleStatus', () => {
  const now = 1_700_000_000_000
  const checks = {
    uses: 10,
    expiration: now + DAY,
    effective: now - DAY,
    salt: '0x',
    contractSignatureIndex: 0,
    signerSignatureIndex: 0,
    allowedRoot: '0x',
    externalChecks: []
  }

  it('keeps the terminal states the server reported', () => {
    expect(liveSaleStatus({ status: 'cancelled', checks }, now)).toBe('cancelled')
    expect(liveSaleStatus({ status: 'revoked', checks }, now)).toBe('revoked')
    expect(liveSaleStatus({ status: 'exhausted', checks }, now)).toBe('exhausted')
  })

  it('reads the window against the clock', () => {
    expect(liveSaleStatus({ status: 'active', checks }, now)).toBe('active')
    expect(liveSaleStatus({ status: 'active', checks }, now + 2 * DAY)).toBe('ended')
    expect(
      liveSaleStatus(
        { status: 'scheduled', checks: { ...checks, effective: now + DAY, expiration: now + 2 * DAY } },
        now
      )
    ).toBe('scheduled')
  })
})
