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

const { getLatestOffChainMarketplaceContract } = await import('./marketplace')

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
