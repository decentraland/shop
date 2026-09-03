import { ChainId } from '@dcl/schemas'
import { ContractName, getContract, getLatestOffChainMarketplace } from '../../../tools/migrate-listings/src/dcl-transactions'
import { describe, expect, it } from 'vitest'
import { getContract as getRegistryContract, ContractName as RegistryContractName } from 'decentraland-transactions'
import { getLatestOffChainMarketplaceContract } from './marketplace'

/**
 * The lockstep guard for the two version lists that cannot be shared.
 *
 * The CLI vendors its own contract table because importing decentraland-transactions drags in an optional
 * `@0xsquid/sdk` peer a lean CLI install does not have. That leaves a comment pair as the only thing keeping
 * it aligned with the app — and the app tracks `^3.1.1`, so a routine lockfile refresh can adopt a newer
 * registry on its own. Whichever side moves first, the result is a listing signed against one marketplace
 * while the other grants minter rights on a different one, and the mint reverts. This fails CI instead.
 */
const CHAINS = [ChainId.MATIC_MAINNET, ChainId.MATIC_AMOY, ChainId.ETHEREUM_MAINNET, ChainId.ETHEREUM_SEPOLIA]

describe.each(CHAINS)('when the CLI resolves the off-chain marketplace on chain %s', chainId => {
  it('should pick the same one the app signs and grants against', () => {
    expect(getLatestOffChainMarketplace(chainId).address.toLowerCase()).toBe(
      getLatestOffChainMarketplaceContract(chainId).address.toLowerCase()
    )
  })
})

describe('when checking the addresses the CLI vendored', () => {
  const VENDORED = [
    [ContractName.OffChainMarketplaceV2, RegistryContractName.OffChainMarketplaceV2],
    [ContractName.OffChainMarketplaceV3, RegistryContractName.OffChainMarketplaceV3]
  ] as const

  describe.each(VENDORED)('and the version is %s', (cliName, registryName) => {
    it('should match decentraland-transactions on every chain the CLI claims to know', () => {
      for (const chainId of CHAINS) {
        let vendored: string | undefined
        try {
          vendored = getContract(cliName, chainId).address.toLowerCase()
        } catch {
          continue // the CLI does not claim this chain for this version
        }
        expect(vendored).toBe(getRegistryContract(registryName, chainId).address.toLowerCase())
      }
    })
  })
})
