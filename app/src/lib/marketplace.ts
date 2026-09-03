import { ChainId } from '@dcl/schemas'
import { ContractName, getContract } from 'decentraland-transactions'

/**
 * Off-chain marketplace versions, newest first.
 *
 * The EIP-712 domain names its verifying contract, so the version a listing is signed against is part of
 * what the seller signed — and every allowance, approval and minter right the shop asks for has to name
 * that same contract, or the listing cannot settle. V3 is testnet-only for now, so mainnet has to keep
 * using V2 rather than fail.
 *
 * KEEP IN LOCKSTEP with OFFCHAIN_MARKETPLACE_NAMES in `tools/migrate-listings/src/dcl-transactions.ts`,
 * which vendors the same order for the CLI. See that file for why the list cannot simply be imported.
 */
const OFF_CHAIN_MARKETPLACE_CONTRACT_NAMES = [ContractName.OffChainMarketplaceV3, ContractName.OffChainMarketplaceV2]

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

/**
 * Every off-chain marketplace version deployed on the chain, newest first.
 *
 * Separate from {@link getLatestOffChainMarketplaceContract}, which answers where a NEW listing goes. This
 * answers where a wallet might ALREADY have granted something: an allowance, approval or minter right given
 * to an older version stays live on chain after a newer one ships, and the Approvals page is the only place
 * it can be seen or taken back.
 */
export function getDeployedOffChainMarketplaceContracts(chainId: ChainId) {
  return OFF_CHAIN_MARKETPLACE_CONTRACT_NAMES.reduce<ReturnType<typeof getContract>[]>((deployed, contractName) => {
    try {
      deployed.push(getContract(contractName, chainId))
    } catch {
      // Not deployed on this chain.
    }
    return deployed
  }, [])
}
