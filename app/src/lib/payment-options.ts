// Which payment rails a buyer can use for ONE item, and how a mixed payment splits.
//
// The shop is credits-first, but a buyer may already hold MANA (legacy holders, or MANA someone sent
// them). When they do, we offer every rail their balances actually support:
//
//   • 'credits'  — the default rail. Available when the credit balance alone covers the price.
//                  Settles via CreditsManager.useCredits (maxUncreditedValue = 0).
//   • 'combined' — credits FIRST, then MANA covers the remainder. Only meaningful when credits exist
//                  but don't cover the whole price (otherwise it collapses into 'credits'). Settles via
//                  CreditsManager.useCredits with the credit sized to the balance, so the contract's
//                  maxUncreditedValue is the MANA gap and it pulls that MANA from the buyer.
//   • 'mana'     — pay entirely in MANA, spending no credits. Settles via marketplace.accept DIRECTLY,
//                  because CreditsManager.useCredits reverts with NoCredits() when given zero credits.
//
// This module is PURE (no network, no wallet, no oracle) so every branch of the money split is unit
// testable. All USD amounts are integer CENTS (1 credit = 10 cents) and all MANA amounts are wei
// bigints, so nothing here can drift through floats.

export type PaymentMethod = 'credits' | 'mana' | 'combined'

export type PaymentOption =
  /** Spend `creditsCents` of credits; no MANA. */
  | { method: 'credits'; creditsCents: number; manaWei: 0n }
  /** Spend no credits; pay `manaWei` MANA. */
  | { method: 'mana'; creditsCents: 0; manaWei: bigint }
  /** Spend `creditsCents` (the whole credit balance) + `manaWei` MANA for the remainder. */
  | { method: 'combined'; creditsCents: number; manaWei: bigint }

/**
 * Why no MANA rail is on the table for a buyer who DOES hold MANA — enough to say so on screen.
 *
 * Silently dropping the MANA button reads as a bug ("I have MANA, where did the option go?"), so the UI
 * shows it disabled with what the balance is actually worth. That number is the whole explanation: MANA
 * is priced by an oracle, so a balance the navbar shows as 194.51 can be worth far less than the credits
 * price it's being compared against.
 */
export type ManaShortfall = {
  /** The buyer's MANA balance, in wei. */
  manaWei: bigint
  /** What that balance is worth in cents at this purchase's rate. Floored — never overstate it. */
  manaCents: number
  /** What the purchase costs, in cents. */
  priceCents: number
}

export type PaymentOptions = {
  /** Offerable options, in display order: credits, combined, mana. Empty when nothing covers the price. */
  options: PaymentOption[]
  /** The option to pre-select: credits > combined > mana (prefer the credits rail, use MANA last). */
  preferred: PaymentMethod | null
  /**
   * Set only when the buyer holds MANA that still can't pay for this purchase (alone or mixed) — i.e.
   * exactly when a MANA button is missing and the buyer would expect one. Null whenever a MANA rail is
   * offerable, when the balance is zero, or when the rate is unknown (then there is nothing to state).
   */
  manaShortfall: ManaShortfall | null
}

/** Ceiling division for bigints — we round the MANA leg UP so a split can never under-fund the price. */
function ceilDiv(a: bigint, b: bigint): bigint {
  return (a + b - 1n) / b
}

/**
 * The MANA (wei) needed to cover `remainderCents` of a purchase whose full `priceCents` costs
 * `priceManaWei`. Proportional because both sides are the same USD amount at the same oracle rate.
 * Rounded up. The authoritative figure is still what the contract computes at settlement
 * (maxUncreditedValue = full trade MANA price − the credit's MANA value); this is the display/gating
 * figure, and rounding up keeps it on the safe side of that.
 */
export function manaForRemainder(remainderCents: number, priceCents: number, priceManaWei: bigint): bigint {
  if (remainderCents <= 0 || priceCents <= 0) return 0n
  if (remainderCents >= priceCents) return priceManaWei
  return ceilDiv(priceManaWei * BigInt(remainderCents), BigInt(priceCents))
}

export function computePaymentOptions(input: {
  /** The item's price in cents (authoritative, from the trade). */
  priceCents: number
  /** What the item costs in MANA right now (0n when the oracle price is unknown → no MANA rails). */
  priceManaWei: bigint
  /** The buyer's spendable credit balance in cents. */
  balanceCents: number
  /** The buyer's on-chain MANA balance in wei. */
  manaBalanceWei: bigint
}): PaymentOptions {
  const priceCents = Number.isFinite(input.priceCents) ? Math.max(0, Math.trunc(input.priceCents)) : 0
  const balanceCents = Number.isFinite(input.balanceCents) ? Math.max(0, Math.trunc(input.balanceCents)) : 0
  const priceManaWei = input.priceManaWei > 0n ? input.priceManaWei : 0n
  const manaBalanceWei = input.manaBalanceWei > 0n ? input.manaBalanceWei : 0n

  // A priceless item (or an unresolved price) has no payable rail — the caller keeps its loading /
  // error state rather than offering a bogus choice.
  if (priceCents <= 0) return { options: [], preferred: null, manaShortfall: null }

  const options: PaymentOption[] = []

  // 1. Credits alone.
  if (balanceCents >= priceCents) {
    options.push({ method: 'credits', creditsCents: priceCents, manaWei: 0n })
  }

  // 2. Credits + MANA. Only when credits exist AND fall short (with a full credit balance the
  //    remainder is 0 and this is just the credits option), and the MANA balance covers the gap.
  //    MANA rails need a known MANA price.
  if (priceManaWei > 0n && balanceCents > 0 && balanceCents < priceCents) {
    const remainderCents = priceCents - balanceCents
    const manaWei = manaForRemainder(remainderCents, priceCents, priceManaWei)
    if (manaBalanceWei >= manaWei) {
      options.push({ method: 'combined', creditsCents: balanceCents, manaWei })
    }
  }

  // 3. MANA alone (spends no credits) — offered whenever the MANA balance covers the whole price,
  //    even if the buyer also has enough credits: spending MANA instead of credits is their call.
  if (priceManaWei > 0n && manaBalanceWei >= priceManaWei) {
    options.push({ method: 'mana', creditsCents: 0, manaWei: priceManaWei })
  }

  // Prefer the credits rail; then the mixed one (it still spends credits first); MANA last.
  const preferred: PaymentMethod | null =
    options.find(o => o.method === 'credits')?.method ??
    options.find(o => o.method === 'combined')?.method ??
    options.find(o => o.method === 'mana')?.method ??
    null

  // Held MANA that buys nothing here. Reported only when a MANA rail is genuinely absent, so a UI can
  // render the disabled button off this field alone without re-deriving the condition.
  const hasManaRail = options.some(o => o.method === 'mana' || o.method === 'combined')
  const manaShortfall: ManaShortfall | null =
    !hasManaRail && priceManaWei > 0n && manaBalanceWei > 0n
      ? { manaWei: manaBalanceWei, manaCents: manaBalanceToCents(manaBalanceWei, priceCents, priceManaWei), priceCents }
      : null

  return { options, preferred, manaShortfall }
}

/**
 * What a MANA balance is worth in cents, priced off this purchase (its cents ÷ its MANA price) so the
 * figure can never disagree with the amounts the buttons charge. Floored: a balance shown as worth N
 * must actually cover N.
 */
function manaBalanceToCents(manaBalanceWei: bigint, priceCents: number, priceManaWei: bigint): number {
  return Number((manaBalanceWei * BigInt(priceCents)) / priceManaWei)
}

/**
 * Spread a credit balance across the units of a CART, in order, for a combined payment.
 *
 * A basket settles as one accept([...]) with one ephemeral credit per unit, so the credit legs have to
 * be sized per unit — not as one lump. Each unit takes as much of the remaining balance as its own
 * price needs; the unit that exhausts the balance takes a PARTIAL credit, and every unit after it takes
 * none (0) because MANA covers them. The MANA gap is whatever the credits didn't pay for the basket.
 *
 * Returns one cents amount per unit (same order/length as `unitCents`). Sums to
 * min(balanceCents, Σ unitCents), so the caller can derive the gap as Σ unitCents − Σ result.
 */
export function distributeCreditsAcrossUnits(unitCents: number[], balanceCents: number): number[] {
  let remaining = Number.isFinite(balanceCents) ? Math.max(0, Math.trunc(balanceCents)) : 0
  return unitCents.map(raw => {
    const price = Number.isFinite(raw) ? Math.max(0, Math.trunc(raw)) : 0
    const take = Math.min(price, remaining)
    remaining -= take
    return take
  })
}

/** Cents → whole credits (1 credit = 10 cents), for display next to a MANA amount. */
export function creditsFromCents(cents: number): number {
  return Number.isFinite(cents) ? Math.max(0, cents) / 10 : 0
}

/** Convenience: does the buyer have any way to pay for this item right now? */
export function hasPayableOption(o: PaymentOptions): boolean {
  return o.options.length > 0
}

/** Look up one computed option by method (null when it isn't offerable). */
export function findOption(o: PaymentOptions, method: PaymentMethod): PaymentOption | null {
  return o.options.find(opt => opt.method === method) ?? null
}

/**
 * How much MANA one credit is worth right now, for the "1 credit = X MANA" caption (Figma 1653-368866).
 * Derived from the SAME numbers the buttons charge (the purchase's cents and its MANA price), so the
 * caption can never disagree with the amounts above it. Returns null when the MANA price is unknown.
 */
export function manaPerCredit(priceCents: number, priceManaWei: bigint): number | null {
  if (!Number.isFinite(priceCents) || priceCents <= 0 || priceManaWei <= 0n) return null
  const credits = priceCents / 10 // 1 credit = 10 cents
  return Number(priceManaWei) / 1e18 / credits
}
