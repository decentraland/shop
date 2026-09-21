import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { ethers } from 'ethers'
import { ChainId } from '@dcl/schemas'
import {
  collectionsRoot,
  couponDomain,
  couponTypedValues,
  couponTypes,
  createCollectionSale,
  encodeCouponData,
  endSale,
  findCouponContracts,
  getCouponContracts,
  isSaleCapped,
  liveSaleStatus,
  SaleInputError,
  UNCAPPED_USES,
  validateSaleTerms,
  type CouponContracts,
  type CreatorSale,
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
  // Two managers are live on Polygon mainnet, one per marketplace version, and a coupon only redeems on
  // the marketplace wired to the one that signed it. The version the shop lists on is V3, so its manager
  // is the only one whose coupons apply to those listings; the older manager is 0x3fd3056e…6081.
  it('returns the manager of the marketplace the shop lists on, not the chain', () => {
    const contracts = getCouponContracts(ChainId.MATIC_MAINNET)
    expect(contracts?.couponManager.address).toBe('0x655fdfa91d69ea49f4ce1a8f7f7e2622c8630813')
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
    expect(readIndexes).toHaveBeenCalledWith('0x655fdfa91d69ea49f4ce1a8f7f7e2622c8630813', wallet.address.toLowerCase())

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

// Polygon mainnet: the manager each live marketplace version redeems through, and the one discount coupon they share.
const COUPON_MANAGER_V3 = '0x655fdfa91d69ea49f4ce1a8f7f7e2622c8630813'
const COUPON_MANAGER_V2 = '0x3fd3056ee72a2a85e9392fab3a450e7736536081'
const COLLECTION_DISCOUNT_COUPON = '0xc914507fe297b2dddd1232ac3a8903f1c125e794'

describe('when finding the coupon deployment a sale was signed against', () => {
  let contracts: CouponContracts | null

  describe('and the manager is the one paired with the current marketplace version', () => {
    beforeEach(() => {
      contracts = findCouponContracts(ChainId.MATIC_MAINNET, COUPON_MANAGER_V3)
    })

    it('should return it together with the chain\'s discount coupon', () => {
      expect({ manager: contracts?.couponManager.address, coupon: contracts?.collectionDiscountCoupon }).toEqual({
        manager: COUPON_MANAGER_V3,
        coupon: COLLECTION_DISCOUNT_COUPON
      })
    })
  })

  describe('and the manager is the one paired with the previous marketplace version, in another casing', () => {
    beforeEach(() => {
      contracts = findCouponContracts(ChainId.MATIC_MAINNET, COUPON_MANAGER_V2.toUpperCase().replace('0X', '0x'))
    })

    it('should return that manager rather than the current one', () => {
      expect(contracts?.couponManager.address).toBe(COUPON_MANAGER_V2)
    })
  })

  describe('and no marketplace version on the chain is paired with the manager', () => {
    beforeEach(() => {
      contracts = findCouponContracts(ChainId.MATIC_MAINNET, '0x0000000000000000000000000000000000000001')
    })

    it('should return null', () => {
      expect(contracts).toBeNull()
    })
  })

  describe('and the chain has no collections', () => {
    beforeEach(() => {
      contracts = findCouponContracts(ChainId.ETHEREUM_MAINNET, '0xf9180eed4a2e4e3d8a3a9a2f2f5f3b8e0d6a1eb2')
    })

    it('should return null, since nothing there can carry a discount', () => {
      expect(contracts).toBeNull()
    })
  })
})

describe('when ending a sale', () => {
  let sale: CreatorSale
  let signer: ethers.Signer
  let cancelSignature: ReturnType<typeof vi.fn>
  let connect: ReturnType<typeof vi.fn>

  beforeEach(() => {
    sale = {
      id: 'sale-1',
      signer: '0x' + 'aa'.repeat(20),
      chainId: ChainId.MATIC_MAINNET,
      network: 'MATIC',
      checks: {
        uses: 100,
        expiration: 1_800_000_000_000,
        effective: 1_700_000_000_000,
        salt: '0x' + '22'.repeat(32),
        contractSignatureIndex: 0,
        signerSignatureIndex: 0,
        allowedRoot: '0x',
        externalChecks: []
      },
      couponManager: COUPON_MANAGER_V3,
      couponAddress: COLLECTION_DISCOUNT_COUPON,
      discountType: 1,
      discount: 300_000,
      root: '0x' + '11'.repeat(32),
      collections: COLLECTIONS,
      signature: '0x' + 'ab'.repeat(65),
      createdAt: 1_700_000_000_000,
      state: null,
      status: 'active'
    }
    signer = { provider: {} } as unknown as ethers.Signer
    cancelSignature = vi.fn().mockResolvedValue({ wait: async () => ({ transactionHash: '0xtx' }) })
    connect = vi.fn().mockReturnValue({ cancelSignature })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('and the sale was signed against the previous version\'s manager', () => {
    let result: string

    beforeEach(async () => {
      sale.couponManager = COUPON_MANAGER_V2
      result = await endSale({ sale, signer }, { connect })
    })

    it('should cancel it on that manager, not on the one new sales sign against', () => {
      expect(connect.mock.calls[0][0]).toBe(COUPON_MANAGER_V2)
    })

    it('should return the hash of the cancellation', () => {
      expect(result).toBe('0xtx')
    })
  })

  describe('and the sale was signed against the current version\'s manager', () => {
    beforeEach(async () => {
      await endSale({ sale, signer }, { connect })
    })

    it('should cancel it on that manager', () => {
      expect(connect.mock.calls[0][0]).toBe(COUPON_MANAGER_V3)
    })
  })

  describe('and the sale names a manager this build does not know on its chain', () => {
    let attempt: Promise<string>

    beforeEach(() => {
      sale.couponManager = '0x0000000000000000000000000000000000000001'
      attempt = endSale({ sale, signer }, { connect })
    })

    it('should refuse before connecting to anything', async () => {
      await expect(attempt).rejects.toThrow('is not one this build knows on chain 137')
      expect(connect).not.toHaveBeenCalled()
    })
  })
})
