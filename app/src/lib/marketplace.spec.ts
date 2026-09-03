import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('decentraland-transactions', () => ({
  ContractName: {
    OffChainMarketplaceV2: 'OffChainMarketplaceV2',
    OffChainMarketplaceV3: 'OffChainMarketplaceV3'
  },
  // Mirrors the real getContract: it THROWS for a version a chain does not have.
  getContract: (name: string, chainId: number) => {
    const deployments: Record<string, number[]> = {
      OffChainMarketplaceV2: [1, 11155111],
      OffChainMarketplaceV3: [11155111]
    }
    if (!deployments[name]?.includes(chainId)) {
      throw new Error(`Could not get a valid contract for ${name} using chain ${chainId}`)
    }
    return { address: `0x${name.toLowerCase()}`, name, version: '1.0.0', abi: [] }
  }
}))

const { getDeployedOffChainMarketplaceContracts, getLatestOffChainMarketplaceContract } = await import('./marketplace')

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
      chainId = 1
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

/**
 * The companion to the resolver above, and a different question: not "where does a NEW listing go" but
 * "where might a wallet ALREADY have granted something". A grant on a superseded version stays live on
 * chain, so anything that has to show or revoke one needs the whole list, not just the newest.
 */
describe('when listing every off-chain marketplace deployed on a chain', () => {
  describe('and the chain has both a V3 and a V2 deployment', () => {
    let chainId: number

    beforeEach(() => {
      chainId = 11155111
    })

    it('should return both, newest first', () => {
      expect(getDeployedOffChainMarketplaceContracts(chainId).map(contract => contract.name)).toEqual([
        'OffChainMarketplaceV3',
        'OffChainMarketplaceV2'
      ])
    })
  })

  describe('and the chain has only one deployment', () => {
    let chainId: number

    beforeEach(() => {
      chainId = 1
    })

    it('should return just that one, so a single-version chain renders a single row per permission', () => {
      expect(getDeployedOffChainMarketplaceContracts(chainId).map(contract => contract.name)).toEqual([
        'OffChainMarketplaceV2'
      ])
    })
  })

  describe('and the chain has no off-chain marketplace at all', () => {
    let chainId: number

    beforeEach(() => {
      chainId = 42161
    })

    // Every candidate throws here, so this also pins that the guard swallows rather than propagates.
    it('should return nothing instead of throwing', () => {
      expect(getDeployedOffChainMarketplaceContracts(chainId)).toEqual([])
    })
  })
})
