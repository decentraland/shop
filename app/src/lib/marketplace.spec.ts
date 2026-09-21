import { beforeEach, describe, expect, it, vi } from 'vitest'

/** Stands in for a chain that has not received the newest version. Every real one now has V3. */
const CHAIN_WITHOUT_V3 = 137

vi.mock('decentraland-transactions', () => ({
  ContractName: {
    OffChainMarketplaceV2: 'OffChainMarketplaceV2',
    OffChainMarketplaceV3: 'OffChainMarketplaceV3'
  },
  // Mirrors the real getContract: it THROWS for a version a chain does not have.
  getContract: (name: string, chainId: number) => {
    const deployments: Record<string, number[]> = {
      OffChainMarketplaceV2: [1, 11155111, CHAIN_WITHOUT_V3],
      OffChainMarketplaceV3: [1, 11155111]
    }
    if (!deployments[name]?.includes(chainId)) {
      throw new Error(`Could not get a valid contract for ${name} using chain ${chainId}`)
    }
    return { address: `0x${name.toLowerCase()}`, name, version: '1.0.0', abi: [] }
  },
  // Mirrors the real one: the address is the only input and an unknown one THROWS.
  getContractName: (address: string) => {
    const names: Record<string, string> = {
      '0xoffchainmarketplacev2': 'OffChainMarketplaceV2',
      '0xoffchainmarketplacev3': 'OffChainMarketplaceV3'
    }
    const name = names[address.toLowerCase()]
    if (!name) throw new Error(`Could not get a valid contract name for address ${address}`)
    return name
  },
  // One manager per marketplace version, as the real registry pairs them.
  getCouponManager: (marketplace: string, chainId: number) => ({
    address: `0xManagerOf${marketplace}On${chainId}`,
    name: 'CouponManager',
    version: '1.0.0',
    abi: []
  })
}))

const { getCouponManagerForTrade, getLatestOffChainMarketplaceContract, getMarketplaceForTrade } = await import('./marketplace')

describe('when getting the latest off-chain marketplace contract', () => {
  describe('and the chain has a V3 deployment', () => {
    let chainId: number

    beforeEach(() => {
      chainId = 11155111
    })

    it('should return V3, so a listing and its approvals all name the newest deployment', () => {
      expect(getLatestOffChainMarketplaceContract(chainId).name).toBe('OffChainMarketplaceV3')
    })
  })

  describe('and the chain has no V3 deployment', () => {
    let chainId: number

    beforeEach(() => {
      chainId = CHAIN_WITHOUT_V3
    })

    it('should fall back to V2 rather than throw', () => {
      expect(getLatestOffChainMarketplaceContract(chainId).name).toBe('OffChainMarketplaceV2')
    })
  })

  describe('and the chain has no off-chain marketplace at all', () => {
    let chainId: number

    beforeEach(() => {
      chainId = 42161
    })

    it('should throw naming the chain', () => {
      expect(() => getLatestOffChainMarketplaceContract(chainId)).toThrowError(
        'No off-chain marketplace contract exists on chain 42161'
      )
    })
  })
})

describe('when resolving the coupon manager a trade settles through', () => {
  let result: string | null

  describe('and the trade names the newest marketplace version', () => {
    beforeEach(() => {
      result = getCouponManagerForTrade({ contract: '0xOffChainMarketplaceV3', chainId: 11155111 })
    })

    it('should return that version\'s manager on the trade\'s chain, lowercased', () => {
      expect(result).toBe('0xmanagerofoffchainmarketplacev3on11155111')
    })
  })

  describe('and the trade names the previous marketplace version', () => {
    beforeEach(() => {
      result = getCouponManagerForTrade({ contract: '0xOffChainMarketplaceV2', chainId: 11155111 })
    })

    it('should return the previous version\'s manager rather than the newest one', () => {
      expect(result).toBe('0xmanagerofoffchainmarketplacev2on11155111')
    })
  })

  describe('and the trade pairs a known address with a chain that version is not deployed on', () => {
    beforeEach(() => {
      result = getCouponManagerForTrade({ contract: '0xOffChainMarketplaceV3', chainId: CHAIN_WITHOUT_V3 })
    })

    it('should return null rather than lend that chain\'s manager to a trade that settles elsewhere', () => {
      expect(result).toBeNull()
    })
  })

  describe('and the trade names a contract the registry does not know', () => {
    beforeEach(() => {
      result = getCouponManagerForTrade({ contract: '0x0000000000000000000000000000000000000001', chainId: 11155111 })
    })

    it('should return null instead of throwing into the checkout review', () => {
      expect(result).toBeNull()
    })
  })
})

describe('when resolving the marketplace a trade names', () => {
  let result: { name: string } | null

  describe('and the address is that version\'s deployment on the trade\'s chain, in another casing', () => {
    beforeEach(() => {
      result = getMarketplaceForTrade({ contract: '0xOFFCHAINMARKETPLACEV3', chainId: 11155111 })
    })

    it('should return the registry entry', () => {
      expect(result?.name).toBe('OffChainMarketplaceV3')
    })
  })

  describe('and the version is not deployed on the trade\'s chain', () => {
    beforeEach(() => {
      result = getMarketplaceForTrade({ contract: '0xOffChainMarketplaceV3', chainId: CHAIN_WITHOUT_V3 })
    })

    it('should return null, since nothing on that chain signed the trade', () => {
      expect(result).toBeNull()
    })
  })

  describe('and the address is not a marketplace the registry knows', () => {
    beforeEach(() => {
      result = getMarketplaceForTrade({ contract: '0x0000000000000000000000000000000000000001', chainId: 11155111 })
    })

    it('should return null', () => {
      expect(result).toBeNull()
    })
  })
})
