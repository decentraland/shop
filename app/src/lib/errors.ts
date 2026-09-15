import { t } from '~/intl/i18n'
import { CURRENCY } from '~/lib/currency'
import { chainLabel, isWalletUnauthorizedError, isWrongNetworkError } from '~/lib/network'

// Central, safe mapping from a thrown error to a localized, user-facing string. The golden rule:
// NEVER surface raw backend/exception text to the buyer (it's unpredictable, untranslated, and can
// leak internals) — every path returns a curated `t()` message or the caller's own `fallback`.

type ErrLike = { code?: number; status?: number; message?: string; name?: string }

/** User bailed out: wallet rejection (EIP-1193 4001), an aborted fetch, or a reject/deny/cancel message. */
export function isRejection(e: unknown): boolean {
  const err = e as ErrLike
  return err.code === 4001 || err.name === 'AbortError' || /reject|denied|cancel/i.test(err.message ?? '')
}

/**
 * The CreditsManager's own revert selectors, for the two refusals a buyer can actually meet and that the
 * generic "please try again" is actively wrong about.
 *
 * Read off the REVERT rather than predicted before the purchase, deliberately. Both conditions are
 * contract-internal — `SenderBalanceChanged` compares `balanceOf(sender)` across the external call, and the
 * royalty recipient is whatever `RoyaltiesManager.getRoyaltiesReceiver` says at settlement time — so any
 * client-side model of them is a replica that drifts. One was tried here and was wrong in both directions:
 * it compared the buyer against the item's `creator`, while the contract pays the item's `beneficiary` when
 * one is set, so it let the real beneficiary through and refused a creator whose item names someone else.
 * The selector is exact and cannot produce a false refusal.
 *
 * Best-effort by nature: the data is present when the failure comes from gas estimation (the usual case,
 * since ethers estimates before sending) and absent when a transaction mines and reverts, which carries no
 * reason. An unmatched revert simply falls through to the caller's generic copy.
 */
const REVERT_SELECTORS = {
  /** The purchase would pay the BUYER — a royalty on their own item, or their own listing's proceeds. */
  senderBalanceChanged: '0x55dd312d',
  /** `secondarySalesAllowed` is false on the CreditsManager: no resale can settle with credits at all. */
  secondarySalesNotAllowed: '0x112aa548'
} as const

/**
 * Whether a failure carries a given custom-error selector.
 *
 * Ethers buries revert data at a different depth per provider (`data`, `error.data`, `error.error.data`, a
 * JSON-RPC `body` string), so this searches the shapes it is actually found in rather than naming one. The
 * selector is 4 bytes of a keccak hash — specific enough that a substring match cannot collide with
 * anything else in an error payload.
 */
function hasRevertSelector(e: unknown, selector: string): boolean {
  const err = e as { data?: unknown; error?: unknown; body?: unknown; message?: string }
  const candidates: unknown[] = [
    err.data,
    err.message,
    err.body,
    (err.error as { data?: unknown } | undefined)?.data,
    (err.error as { message?: unknown } | undefined)?.message,
    (err.error as { error?: { data?: unknown } } | undefined)?.error?.data
  ]
  return candidates.some(c => typeof c === 'string' && c.toLowerCase().includes(selector))
}

/** The purchase reverted because it would have paid the buyer (royalty on their own item). */
export function isSenderBalanceChangedError(e: unknown): boolean {
  return hasRevertSelector(e, REVERT_SELECTORS.senderBalanceChanged)
}

/** The purchase reverted because the CreditsManager is not settling resales at all. */
export function isSecondarySalesNotAllowedError(e: unknown): boolean {
  return hasRevertSelector(e, REVERT_SELECTORS.secondarySalesNotAllowed)
}

/**
 * A "not enough credits" failure (server 402 / "insufficient"). Purchase flows treat this as a normal
 * top-up prompt (route to the pack picker) rather than an error state, so it's exposed separately.
 */
export function isInsufficient(e: unknown): boolean {
  const err = e as ErrLike
  return err.code === 402 || err.status === 402 || (err.message ?? '').toLowerCase().includes('insufficient')
}

/**
 * Map a thrown error to a safe, localized string for display.
 * - Wallet/abort rejection is handled universally.
 * - So are the two WALLET-STATE failures, because every on-chain flow can hit them and the generic fallback
 *   ("please try again") is actively wrong for both: retrying changes nothing until the wallet does. Handling
 *   them here rather than per surface is what makes every screen — checkout, cart, cancel, transfer, approve,
 *   mint — say the same true thing without each one having to know about networks.
 * - Purchase flows pass `sale: true` to also map funds/availability failures (insufficient credits,
 *   sold/removed item, own listing) to their curated messages.
 * - Anything unrecognized returns `fallback` — a context-specific generic the caller supplies
 *   (e.g. "Couldn't list your item…" vs "Couldn't complete checkout…"), never the raw error.
 */
export function friendlyError(e: unknown, fallback: string, opts: { sale?: boolean } = {}): string {
  if (isRejection(e)) return t('errors.rejected')
  // Name both networks: "your wallet is on Ethereum, this runs on Polygon" tells them what to do, which is
  // the whole point — the shop no longer switches networks for them.
  if (isWrongNetworkError(e))
    return t('errors.wrongNetwork', { current: chainLabel(e.current), required: chainLabel(e.required) })
  // The wallet refused the request itself (-32006/4100). Ethers dresses this up as a revert, so without this
  // the buyer is told the transaction failed on-chain when it never left their wallet.
  if (isWalletUnauthorizedError(e)) return t('errors.walletUnauthorized')
  // Before the `sale` block and outside it: neither is about funds or availability, both are final rather
  // than worth retrying, and every surface that can reach them needs the same true sentence.
  if (isSenderBalanceChangedError(e)) return t('errors.creatorRoyalty')
  if (isSecondarySalesNotAllowedError(e)) return t('errors.resalesUnavailable')
  if (opts.sale) {
    const msg = ((e as ErrLike).message ?? '').toLowerCase()
    if (msg.includes('insufficient')) return t('errors.insufficient', { currency: CURRENCY.name })
    if (/not for sale|not found|no active listing|404/.test(msg)) return t('errors.soldOrRemoved')
    if (msg.includes('your own listing')) return t('errors.cantBuyOwn')
  }
  return fallback
}
