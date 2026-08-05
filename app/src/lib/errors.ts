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
  if (opts.sale) {
    const msg = ((e as ErrLike).message ?? '').toLowerCase()
    if (msg.includes('insufficient')) return t('errors.insufficient', { currency: CURRENCY.name })
    if (/not for sale|not found|no active listing|404/.test(msg)) return t('errors.soldOrRemoved')
    if (msg.includes('your own listing')) return t('errors.cantBuyOwn')
  }
  return fallback
}
