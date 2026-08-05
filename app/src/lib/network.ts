import { ethers } from 'ethers'
import { ChainId, getChainName } from '@dcl/schemas'

/**
 * The wallet's network: reading it, and CHANGING it only when the user asked for that.
 *
 * The shop used to move the wallet by itself. Every on-chain leg called an `ensureChain` that fired
 * `wallet_switchEthereumChain` with no prompt of our own, so a person who had deliberately put MetaMask on
 * Ethereum found themselves back on Polygon after clicking Buy — and the failure they got said nothing about
 * networks. Two separate things were wrong with that:
 *
 *   - it is their wallet. Moving it silently is not ours to do, and it undoes a choice they just made.
 *   - a wallet only honours `wallet_*` requests it can attribute to a user action. Fired from a fallback path
 *     minutes after the click, the request comes back `-32006 Unauthorized` (or `4100`), which ethers then
 *     reports as "missing revert data … reverted without a reason string". Unreadable, and it named the wrong
 *     thing entirely.
 *
 * So the two halves are deliberately separate here. `requireChain` only ever ASKS the wallet where it is and
 * refuses to continue if the answer is wrong; `switchChain` is the one that requests the change, and it must be
 * called from inside the user's own click.
 *
 * Note what does NOT need any of this: the gasless rails. A relayed meta-transaction is an off-chain signature
 * whose EIP-712 domain carries the chain in `salt`, not in `chainId`, and every node read goes through our own
 * RPC (see metaTxProviderShim) — so it works from whatever network the wallet happens to be on. Only the
 * gas-paying legs, where the wallet itself broadcasts, care. Gate those and nothing else.
 */

/** Human name for a chain — "Polygon", "Ethereum Mainnet", "Amoy". Falls back to the id for unknown chains. */
export function chainLabel(chainId: number): string {
  return getChainName(chainId) ?? `chain ${chainId}`
}

/**
 * The wallet is not on the network this action runs on. Carries both chains so the message can name them —
 * "your wallet is on Ethereum, this runs on Polygon" is actionable; "please try again" is not.
 */
export class WrongNetworkError extends Error {
  constructor(
    readonly current: number,
    readonly required: number
  ) {
    super(`Wallet is on ${chainLabel(current)}, but this runs on ${chainLabel(required)}`)
    this.name = 'WrongNetworkError'
  }
}

/** Also true across module boundaries where `instanceof` can fail (mocked/duplicated module instances). */
export function isWrongNetworkError(e: unknown): e is WrongNetworkError {
  return e instanceof WrongNetworkError || (e as { name?: string } | null)?.name === 'WrongNetworkError'
}

/**
 * Which chain the wallet is on RIGHT NOW.
 *
 * Deliberately `eth_chainId` and not `provider.getNetwork()`: ethers caches the network a Web3Provider first
 * detected, so someone who switched networks after the page loaded gets measured against a stale value — and
 * once ethers notices the change it throws `underlying network changed` instead of answering at all.
 */
export async function activeChainId(provider: ethers.providers.Web3Provider): Promise<number> {
  const raw = (await provider.send('eth_chainId', [])) as string | number
  const parsed = typeof raw === 'string' ? parseInt(raw, 16) : Number(raw)
  // An unusable answer THROWS. It used to fall back to `provider.getNetwork()`, which reaches for the very
  // cache this function exists to avoid and answers with a number that is plausible and possibly wrong —
  // worse than not answering, since a wrong chain here means submitting to a contract that holds no code.
  if (!Number.isFinite(parsed)) throw new Error(`Wallet answered eth_chainId with an unusable value: ${String(raw)}`)
  return parsed
}

/**
 * Refuse to continue unless the wallet is already on `chainId`. NEVER prompts and never switches.
 *
 * This guards the gas-paying legs. Submitting on the wrong chain is not a cosmetic problem: the DCL contract
 * addresses hold no code on other networks, so the call succeeds as a no-op — a green receipt for a purchase
 * that bought nothing, or a cancellation that cancelled nothing.
 */
export async function requireChain(provider: ethers.providers.Web3Provider, chainId: number): Promise<void> {
  const current = await activeChainId(provider)
  if (current !== chainId) throw new WrongNetworkError(current, chainId)
}

// Amoy is not in most wallets by default, so switching to it can need an add first (EIP-3085).
const AMOY_CHAIN_ID: number = ChainId.MATIC_AMOY
export const AMOY_ADD_PARAMS = {
  chainId: '0x13882',
  chainName: 'Polygon Amoy',
  nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 },
  rpcUrls: ['https://rpc-amoy.polygon.technology'],
  blockExplorerUrls: ['https://amoy.polygonscan.com']
}

/**
 * Ask the wallet to change networks.
 *
 * CALL THIS ONLY FROM INSIDE A USER GESTURE — the click on a "switch network" control. Wallets reject
 * `wallet_*` requests they cannot attribute to a user action, so calling it from a background path or a
 * fallback several minutes later fails with `-32006 Unauthorized` for reasons that have nothing to do with
 * the network. A rejection (4001) propagates: the user declining is an answer, not an error to retry around.
 */
export async function switchChain(provider: ethers.providers.Web3Provider, chainId: number): Promise<void> {
  const hexChain = ethers.utils.hexValue(chainId)
  try {
    await provider.send('wallet_switchEthereumChain', [{ chainId: hexChain }])
  } catch (e) {
    if ((e as { code?: number }).code === 4902 && chainId === AMOY_CHAIN_ID) {
      await provider.send('wallet_addEthereumChain', [AMOY_ADD_PARAMS])
      return
    }
    throw e
  }
}

/**
 * Did the WALLET refuse the request as unauthorized?
 *
 * `-32006` / `4100` mean the wallet would not attribute the request to the user (or the site is no longer a
 * permitted origin for that account). It is never a contract problem, but that is exactly how it surfaces:
 * ethers wraps it as a CALL_EXCEPTION and reports "reverted without a reason string", which sends everyone
 * looking at the contract. Recognising it is what lets the UI say something true instead.
 *
 * Matched on codes only, walking the nested provider errors ethers and MetaMask stack up. A message match
 * would also catch our own API's 401s, which are a different problem with a different answer.
 */
export function isWalletUnauthorizedError(e: unknown, depth = 0): boolean {
  if (!e || typeof e !== 'object' || depth > 4) return false
  const err = e as { code?: unknown; data?: { httpStatus?: number }; error?: unknown; cause?: unknown }
  if (err.code === -32006 || err.code === 4100) return true
  if (err.data?.httpStatus === 401) return true
  return isWalletUnauthorizedError(err.error, depth + 1) || isWalletUnauthorizedError(err.cause, depth + 1)
}
