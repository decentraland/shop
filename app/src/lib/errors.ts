import { t } from '~/intl/i18n'
import { CURRENCY } from '~/lib/currency'

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
 * - Purchase flows pass `sale: true` to also map funds/availability failures (insufficient credits,
 *   sold/removed item, own listing) to their curated messages.
 * - Anything unrecognized returns `fallback` — a context-specific generic the caller supplies
 *   (e.g. "Couldn't list your item…" vs "Couldn't complete checkout…"), never the raw error.
 */
export function friendlyError(e: unknown, fallback: string, opts: { sale?: boolean } = {}): string {
  if (isRejection(e)) return t('errors.rejected')
  if (opts.sale) {
    const msg = ((e as ErrLike).message ?? '').toLowerCase()
    if (msg.includes('insufficient')) return t('errors.insufficient', { currency: CURRENCY.name })
    if (/not for sale|not found|no active listing|404/.test(msg)) return t('errors.soldOrRemoved')
    if (msg.includes('your own listing')) return t('errors.cantBuyOwn')
  }
  return fallback
}
