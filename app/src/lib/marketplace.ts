import { ChainId } from '@dcl/schemas'
import { ContractName, getContract } from 'decentraland-transactions'

/**
 * Off-chain marketplace versions, newest first.
 *
 * The EIP-712 domain names its verifying contract, so the version a listing is signed against is part of
 * what the seller signed — and every allowance, approval and minter right the shop asks for has to name
 * that same contract, or the listing cannot settle. V3 is deployed on every chain the shop uses, so a new
 * listing goes there; the list is still ordered because a chain without the newest version must not fail.
 *
 * KEEP IN LOCKSTEP with the identically-named list in `tools/migrate-listings/src/dcl-transactions.ts`,
 * which vendors the same order for the CLI. See that file for why the list cannot simply be imported;
 * app/src/lib/migrateListingsLockstep.spec.ts fails CI if they diverge.
 */
export const OFF_CHAIN_MARKETPLACE_CONTRACT_NAMES = [
  ContractName.OffChainMarketplaceV3,
  ContractName.OffChainMarketplaceV2
]

/**
 * The newest off-chain marketplace deployed on a chain.
 *
 * `getContract` THROWS for a version that is not deployed on the given chain rather than returning a
 * falsy value, which is why each candidate is tried in turn.
 */
export function getLatestOffChainMarketplaceContract(chainId: ChainId) {
  for (const contractName of OFF_CHAIN_MARKETPLACE_CONTRACT_NAMES) {
    try {
      return getContract(contractName, chainId)
    } catch {
      continue
    }
  }
  throw new Error(`No off-chain marketplace contract exists on chain ${chainId}`)
}
