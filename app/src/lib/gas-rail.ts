import { ethers } from 'ethers'
import type { ProviderType } from '@dcl/schemas'
import { config } from '~/config'
import { canPayGasItself } from '~/lib/wallet-kind'

/**
 * May this buyer be offered the gas-paying fallback, after a relayed rail has failed?
 *
 * Reaching that fallback at all means the relay already failed — the relayed rails work from any network,
 * so nothing else can put a buyer in front of a chain requirement. From there the honest answer differs by
 * who they are, and getting it wrong is worse than saying nothing:
 *
 *  - a MANAGED (web2) wallet holds no POL and has no network control, so "switch to Polygon" is advice it
 *    cannot act on — and gas/network wording is exactly what these users must never see (CONVENTIONS.md).
 *    Today they are shown it anyway, because the fallback never asked who they were.
 *  - a self-custody wallet with no POL would switch, sign, and revert with INSUFFICIENT_FUNDS: a longer
 *    dead end than the one it replaced.
 *
 * Both get told their hold is released instead. Only a self-custody wallet that can actually pay is offered
 * the switch.
 */

/**
 * The POL floor for offering the rail. A conservative fixed amount rather than an `estimateGas`: that call
 * reverts for reasons unrelated to gas (a missing allowance, most often), so it would hide the button from
 * people who could in fact pay — a false negative that is invisible to us and inexplicable to them.
 */
export const MIN_NATIVE_FOR_GAS_WEI = ethers.utils.parseEther('0.05')

/**
 * Does this address hold enough native currency to pay for a transaction ON THE SHOP'S CHAIN?
 *
 * Read through our own RPC, never the wallet's provider: the wallet is on the wrong network — that is the
 * whole reason we are asking — so asking it for a balance answers about the network we are trying to move
 * them off. Same read-only provider the contract reads use.
 *
 * An unreadable balance answers FALSE. The caller uses this to decide whether to offer a rail; a wrong
 * "yes" ends in a signed transaction that reverts, a wrong "no" only shows the calmer of two messages.
 */
export async function hasGasMoney(address: string): Promise<boolean> {
  try {
    const balance = await new ethers.providers.JsonRpcProvider(config.rpcUrl).getBalance(address)
    return balance.gte(MIN_NATIVE_FOR_GAS_WEI)
  } catch {
    return false
  }
}

/** Self-custody AND funded: the two conditions for the gas-paying fallback to be a real option. */
export async function canOfferGasRail(
  providerType: ProviderType | null | undefined,
  address: string
): Promise<boolean> {
  if (!canPayGasItself(providerType)) return false
  return hasGasMoney(address)
}
