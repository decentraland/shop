import { ChainId, type Trade } from '@dcl/schemas'
import { ContractName, getContract, getContractName, getCouponManager, type ContractData } from 'decentraland-transactions'

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

/**
 * The registry entry of the marketplace a trade names, or null when that address is not a marketplace version
 * deployed on the trade's chain.
 *
 * Every settlement rail resolves the marketplace from the address's version name on the trade's chain, so a
 * trade whose pair does not hold would be sent to a contract that never signed it, and revert. getContractName
 * knows addresses, not chains: the same V2 address is deployed on three chains, and a V3 address paired with
 * another chain's id names that chain's deployment instead of failing.
 */
export function getMarketplaceForTrade(trade: Pick<Trade, 'contract' | 'chainId'>): ContractData | null {
  try {
    const name = getContractName(trade.contract)
    // getContractName answers for the WHOLE registry, so an address that is some other Decentraland
    // contract resolves happily. Most would fail later encoding `accept`, but V1 shares V2's ABI and would
    // build a real transaction against a marketplace this app does not support.
    if (!OFF_CHAIN_MARKETPLACE_CONTRACT_NAMES.includes(name)) return null
    const marketplace = getContract(name, trade.chainId)
    return marketplace.address.toLowerCase() === trade.contract.toLowerCase() ? marketplace : null
  } catch {
    return null
  }
}

/**
 * The coupon manager the marketplace a trade names redeems through, lowercased, or null when the trade names no
 * marketplace deployed on its chain, or one without a manager there.
 *
 * Each marketplace version trusts only its own manager, and a trade settles on the version it was signed
 * against, so this is the one manager a coupon must have been signed against to discount the trade.
 */
export function getCouponManagerForTrade(trade: Pick<Trade, 'contract' | 'chainId'>): string | null {
  const marketplace = getMarketplaceForTrade(trade)
  if (!marketplace) return null
  try {
    // By name, not `marketplace.name`: that field is the EIP-712 domain name, not a ContractName.
    return getCouponManager(getContractName(marketplace.address), trade.chainId).address.toLowerCase()
  } catch {
    return null
  }
}
