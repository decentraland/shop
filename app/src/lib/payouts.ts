/**
 * Matching a secondary sale to the credits the seller was paid for it.
 *
 * Two things changed under the seller's feet when proceeds-to-treasury was switched on. The MANA no
 * longer reaches them — it goes to the platform treasury, which credits them off-chain instead — and
 * those credits do not land the moment the sale does: a finality delay, plus a chargeback hold if one
 * is configured, sits in between.
 *
 * The sale row was written before either was true. It reports the MANA figure as income, which the
 * seller never receives, and it has no way to say "your payout is on its way", so the credits look
 * simply missing until they appear.
 *
 * This module answers, for one sale: was this paid into credits, how much, and has it cleared.
 *
 * ON THE MATCHING KEY. A payout carries `(txHash, logIndex)` — the on-chain identity of the fill — but
 * a sale record from `/v1/sales` carries only `txHash`, so `txHash` is as precise as this can get. That
 * is enough for the part that matters: every fill in a transaction settles in the same block under the
 * same hold, so they share `availableAt` and the CLEARED/PENDING answer is never ambiguous. The amount
 * is: one buyer taking two of the same seller's items in a single cart produces two payouts under one
 * hash with no way to tell which is which. That case reports its state and withholds the figure rather
 * than guessing — an amount that might belong to the other row is worse than no amount.
 */

/** One payout row from credits-server's `earnings` block. */
export type Payout = {
  txHash: string
  /** Present once credits-server exposes it; unused for matching (sales carry no log index). */
  logIndex?: number
  /** Net USD cents credited to the seller, after the platform fee. */
  netCents: number
  /** Epoch ms at which the credits become spendable. */
  availableAt: number
  /** Whether they are spendable as of the server's read. */
  available: boolean
}

export type SalePayout =
  /** No payout row: the seller was paid directly in MANA, as before this feature. */
  | { kind: 'direct' }
  /** Credited and spendable. `credits` is null when one transaction holds several of this seller's payouts. */
  | { kind: 'credited'; credits: number | null }
  /** Credited but held. Same caveat on `credits`; `availableAt` is when it clears. */
  | { kind: 'pending'; credits: number | null; availableAt: number }

export type PayoutIndex = Map<string, Payout[]>

const normalize = (txHash: string): string => txHash.trim().toLowerCase()

/** Groups payouts by transaction. Rows without a usable hash are dropped rather than grouped under ''. */
export function indexPayouts(payouts: readonly Payout[] | undefined | null): PayoutIndex {
  const index: PayoutIndex = new Map()
  for (const payout of payouts ?? []) {
    const key = normalize(payout.txHash ?? '')
    if (!key) continue
    const bucket = index.get(key)
    if (bucket) bucket.push(payout)
    else index.set(key, [payout])
  }
  return index
}

/**
 * What this sale was paid into.
 *
 * `now` is injected so the caller controls the clock — the server's `available` flag was computed at
 * read time, and a page left open would otherwise keep rendering "pending" past the moment it cleared.
 * A row counts as cleared if EITHER the server said so or its date has since passed.
 */
export function payoutForSale(
  index: PayoutIndex,
  sale: { txHash?: string | null },
  now: number = Date.now()
): SalePayout {
  const rows = sale.txHash ? index.get(normalize(sale.txHash)) : undefined
  if (!rows || rows.length === 0) return { kind: 'direct' }

  // Ambiguous only in the amount: one transaction, several of this seller's fills, no key to pair them.
  const credits = rows.length === 1 ? centsToCredits(rows[0].netCents) : null

  const held = rows.filter(row => !row.available && row.availableAt > now)
  if (held.length === 0) return { kind: 'credited', credits }

  // The latest date among the held rows — the point at which the whole transaction has cleared, so the
  // row never promises a time by which part of it is still locked.
  const availableAt = held.reduce((latest, row) => Math.max(latest, row.availableAt), 0)
  return { kind: 'pending', credits, availableAt }
}

/**
 * Cents to whole credits at 1 credit = $0.10, rounded DOWN.
 *
 * Deliberately matches how a balance is displayed rather than how a price is charged (prices round up).
 * A payout of 107 cents is 10 credits and 7 cents of change that stays in the balance; showing 11 would
 * promise a credit the seller cannot spend.
 */
export function centsToCredits(cents: number): number {
  return Math.floor(cents / 10)
}
