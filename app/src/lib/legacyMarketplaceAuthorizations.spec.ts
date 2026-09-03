import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * A chain where a newer marketplace has shipped (V3) and the previous one (V2) is still deployed. V1 is
 * absent, so the "how many rows" assertions also cover a chain that never had it.
 */
const CHAIN_WITH_TWO_VERSIONS = 11155111
/** A chain that only ever had one version, which must keep rendering exactly one row per permission. */
const CHAIN_WITH_ONE_VERSION = 1

vi.mock('decentraland-transactions', () => ({
  ContractName: {
    OffChainMarketplace: 'OffChainMarketplace',
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

const { getLegacyMarketplaceAuthorizations } = await import('./authorizations')

describe('when listing the marketplace versions a permission may still be granted on', () => {
  describe('and a newer marketplace has superseded an older one', () => {
    let latest: { id: string; spenderAddress: string; chainId: number }

    beforeEach(() => {
      latest = { id: 'selling:0xcollection', spenderAddress: '0xoffchainmarketplacev3', chainId: CHAIN_WITH_TWO_VERSIONS }
    })

    it('should return the superseded version as its own descriptor', () => {
      expect(getLegacyMarketplaceAuthorizations(latest as never)).toEqual([
        expect.objectContaining({ spenderAddress: '0xoffchainmarketplacev2' })
      ])
    })

    /**
     * The row's react-query cache entry and its test id are both keyed on `id` alone, so two versions
     * sharing an id would read and overwrite each other's active state.
     */
    it('should qualify the superseded descriptor id with its spender', () => {
      const [legacy] = getLegacyMarketplaceAuthorizations(latest as never)

      expect(legacy.id).toBe('selling:0xcollection@0xoffchainmarketplacev2')
    })

    it('should leave the current version its unqualified id, which the page and its tests address', () => {
      const ids = getLegacyMarketplaceAuthorizations(latest as never).map(auth => auth.id)

      expect(ids).not.toContain('selling:0xcollection')
    })
  })

  describe('and the chain has only ever had one marketplace version', () => {
    let latest: { id: string; spenderAddress: string; chainId: number }

    beforeEach(() => {
      latest = { id: 'mana-marketplace', spenderAddress: '0xoffchainmarketplacev2', chainId: CHAIN_WITH_ONE_VERSION }
    })

    it('should return nothing, so exactly one row is rendered per permission', () => {
      expect(getLegacyMarketplaceAuthorizations(latest as never)).toEqual([])
    })
  })
})
