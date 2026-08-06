import { TradeAssetType, type Trade } from '@dcl/schemas'
import { usdWeiToCents, type CatalogItem } from '~/lib/api'
import { usdCentsToCredits } from '~/lib/currency'
import { manaWeiToUsdCents, type ManaRate } from '~/lib/mana-convert'
import { isOwnTrade } from '~/lib/ownership'
// Type only, so this module stays free of the on-chain layer: it describes what a line settles as, and
// lib/buy-mana owns the vocabulary for that.
import type { PurchaseTarget } from '~/lib/buy-mana'

// Cart checkout review: resolve every cart item's LIVE listing before charging, so the buyer is never
// silently charged a stale snapshot price and one bad item never aborts the whole basket.
//
// The cart stores each item's price from when it was added (item.priceCredits). By checkout the live
// listing may have re-priced (a flash sale ended, the seller changed it) or vanished (sold/cancelled),
// or be the buyer's own listing (unbuyable). reviewCart classifies each row against its live trade so
// the UI can prune the unbuyable ones, show the updated total, and ask for confirmation when anything
// differs from what was displayed.

/**
 * How a resolved line settles on-chain. A discriminated union rather than an optional `trade`, so every
 * consumer is forced by the compiler to say which path it handles — this decides which contract gets called
 * with the buyer's credits, and a silent `undefined` there is the shape of a lost or wrong charge.
 */
export type LineSettlement =
  | { acquisition: 'trade'; trade: Trade }
  /**
   * A CollectionStore mint. `priceWei` is the LIVE MANA price re-read at review time, not the snapshot the
   * cart stored: CollectionStore.buy takes the price as an argument and the contract re-validates it against
   * the item's current on-chain price, reverting if it moved. A trade cannot fail that way — its price is
   * signed into the order — so this is the one path where a stale quote is a revert rather than a bad number.
   */
  | { acquisition: 'store'; priceWei: string }

export type ResolvedLine = {
  item: CatalogItem
  usdCents: number // authoritative USD amount from the live listing (what we authorize) — PER UNIT
  priceCredits: number // whole credits shown for that amount (1 credit = $0.10, rounded up) — PER UNIT
  quantity: number // how many units of this line to buy (always 1 for a secondary token)
} & LineSettlement

export type CartReview = {
  buyable: ResolvedLine[] // resolvable, not the buyer's own — safe to charge
  unavailable: CatalogItem[] // no live listing (sold / cancelled / never resolved)
  own: CatalogItem[] // the buyer's own listing — can't buy
  liveTotalCredits: number // sum of the buyable lines' live credit prices
  orderChanged: boolean // a live price differs from what the cart showed, or rows were dropped
}

// sessionStorage key: the cart snapshot stashed when a buyer is sent to Stripe to top up mid-checkout
// (the insufficient-funds → pack picker flow). It survives the full-page Stripe redirect (which wipes
// the in-memory cart store); after the credits land, the /credits return handler routes back to /cart,
// which restores this snapshot and resumes the checkout. Mirrors BuyModal's RESUME_BUY_KEY (per-item).
export const RESUME_CART_KEY = 'dcl_shop_resume_cart'

// Resolves an item to its current on-chain-signed trade, or null when there's no live listing.
export type TradeResolver = (item: CatalogItem) => Promise<Trade | null>

/**
 * Re-reads a CollectionStore mint's LIVE price and remaining supply, or null when it is no longer mintable.
 *
 * The mint equivalent of re-resolving a trade, and needed for the same reason: the cart's stored snapshot can
 * be stale by checkout. Both fields can move without any listing changing — another buyer takes the last unit
 * (`available` hits 0) or the creator re-prices the item — and unlike a trade there is no signature pinning
 * either, so both have to be read again before the buyer is charged.
 */
export type StoreResolver = (item: CatalogItem) => Promise<{ priceWei: string; available: number } | null>

// USD cents → whole credits shown (1 credit = $0.10, rounded up — the shop's whole-credit model).
export function centsToCredits(usdCents: number): number {
  return usdCentsToCredits(usdCents)
}

/**
 * What a line costs in USD cents, read from the LIVE trade.
 *
 * The two kinds of listing in the catalogue denominate that amount differently, and the trade itself is
 * what says which — not the cart item:
 *
 *   - `USD_PEGGED_MANA` — a Shop-native listing. The amount already IS USD wei, so it converts directly.
 *   - `ERC20` — a legacy listing signed by the older Marketplace, priced in MANA. The amount is MANA wei
 *     and only the oracle can say what it is worth, so it needs the live rate.
 *
 * Reading `usdWeiToCents` on a legacy amount does not return a slightly-wrong number — it returns a
 * meaningless one (MANA wei interpreted as USD wei, off by the MANA price), which is why this has to
 * branch rather than being one conversion. Returns 0 when it cannot price the line honestly (no rate for
 * a legacy trade, a malformed amount); the caller treats 0 as "not a real live listing".
 */
export function lineUsdCents(trade: Trade, rate?: ManaRate): number {
  const priceAsset = trade.received[0] as { assetType?: number; amount?: string } | undefined
  if (!priceAsset) return 0

  if (priceAsset.assetType === Number(TradeAssetType.USD_PEGGED_MANA)) {
    return usdWeiToCents(priceAsset.amount)
  }

  // Legacy: MANA-denominated. Matched EXPLICITLY rather than reached by falling through, so pricing fails
  // closed. A fall-through would feed any future asset type — or an absent field after an API regression —
  // through the MANA oracle path and quietly price it as MANA. Zero is the safe answer here because callers
  // already treat a non-positive price as "not a real live listing" and route the item to `unavailable`
  // rather than showing it as free.
  if (priceAsset.assetType === Number(TradeAssetType.ERC20)) {
    // Without a rate we cannot price it, and guessing is worse than deferring.
    if (!rate || !priceAsset.amount) return 0
    return manaWeiToUsdCents(priceAsset.amount, rate)
  }

  return 0
}

/**
 * A resolved line as the purchase rails want it: a live trade to accept, or an item to mint.
 *
 * The one place a catalogue row's `acquisition` becomes "which contract settles it", shared by every checkout
 * surface. Both the cart and the item page's Buy now read it, so neither can pick a different contract for the
 * same row — and every rail (credits, MANA, credits + MANA) branches on the result rather than assuming a trade.
 */
export function purchaseTargetFor(line: ResolvedLine): PurchaseTarget {
  if (line.acquisition === 'trade') return { kind: 'trade', trade: line.trade }
  return {
    kind: 'store',
    mint: {
      item: {
        collection: line.item.contractAddress,
        itemId: String(line.item.itemId),
        // The LIVE price the resolve re-read, which is what CollectionStore.buy verifies on-chain.
        priceWei: line.priceWei
      },
      chainId: line.item.chainId
    }
  }
}

/**
 * Why a row cannot be charged, when `resolveLine` says it can't.
 *
 * Three answers rather than one because the two callers need different amounts of detail: the cart only sorts
 * rows into unavailable/own, while a single-item checkout has to SAY what happened — "no longer available" is
 * the wrong thing to tell a buyer whose price simply could not be read.
 */
export type LineUnbuyable = 'gone' | 'own' | 'no-price'

export type LineOutcome = { status: 'buyable'; line: ResolvedLine } | { status: LineUnbuyable }

/**
 * Resolve ONE row against its live listing (or live mint) and price it.
 *
 * The per-row half of `reviewCart`, extracted so a single-item checkout resolves a purchase by exactly the same
 * rules a cart does. Splitting them is what keeps a mint buyable in one place and not the other: this is the
 * only description of what makes a row chargeable, and both surfaces read it.
 *
 * Reads only — nothing is reserved here.
 */
export async function resolveLine(
  item: CatalogItem & { quantity?: number },
  buyerAddress: string,
  resolve: TradeResolver,
  rate?: ManaRate,
  resolveStore?: StoreResolver
): Promise<LineOutcome> {
  // Quantity applies only to primary (mint) lines; a secondary token is always a single unit.
  const quantity = !item.tokenId ? Math.max(1, Math.floor(item.quantity ?? 1)) : 1

  // A CollectionStore mint has no trade to resolve, so it takes its own branch. `?? 'trade'` because a
  // cart persisted before mints existed carries no value, and every one of those rows is a trade.
  if ((item.acquisition ?? 'trade') === 'store') {
    // No resolver wired (or no rate) → unbuyable, never charged off the caller's snapshot.
    const live = resolveStore ? await resolveStore(item) : null
    if (!live || !rate) return { status: 'gone' }
    // Supply is finite and shrinks as others mint, so a sold-out item has to drop out here rather than
    // revert on-chain after the buyer has paid gas. `quantity` matters: buying 3 of 2 remaining reverts
    // for the whole batch, so the line is unbuyable rather than silently reduced.
    if (live.available < quantity) return { status: 'gone' }
    const usdCents = manaWeiToUsdCents(live.priceWei, rate)
    if (!Number.isFinite(usdCents) || usdCents <= 0) return { status: 'no-price' }
    return {
      status: 'buyable',
      line: {
        item,
        acquisition: 'store',
        priceWei: live.priceWei,
        usdCents,
        priceCredits: centsToCredits(usdCents),
        quantity
      }
    }
  }

  const trade = await resolve(item)
  if (!trade) return { status: 'gone' }
  if (isOwnTrade(trade, buyerAddress)) return { status: 'own' }
  const usdCents = lineUsdCents(trade, rate)
  // A zero/NaN price (empty received, missing/bad amount) is not a real live listing — never let it
  // be charged at 0, which would authorize a $0 credit and revert on-chain.
  if (!Number.isFinite(usdCents) || usdCents <= 0) return { status: 'no-price' }
  return {
    status: 'buyable',
    line: { item, acquisition: 'trade', trade, usdCents, priceCredits: centsToCredits(usdCents), quantity }
  }
}

/**
 * Resolve + classify every cart item against its live listing. Never throws for a single bad row: a
 * failed/absent resolution becomes `unavailable`, the buyer's own listing becomes `own`, and the rest
 * are `buyable` with their live price. Resolved SEQUENTIALLY to keep behaviour deterministic and avoid
 * hammering the API on a large basket (these are reads — no reservation happens here).
 */
export async function reviewCart(
  items: Array<CatalogItem & { quantity?: number }>,
  buyerAddress: string,
  resolve: TradeResolver,
  /**
   * Live MANA/USD rate, needed ONLY to price legacy (plain-ERC20, MANA-denominated) lines — see
   * `lineUsdCents`. Omit it and legacy lines resolve as `unavailable` rather than being priced off a
   * missing rate: showing "no longer available" is recoverable, charging the wrong amount is not.
   */
  rate?: ManaRate,
  /**
   * Re-reads a CollectionStore mint's live price + supply. Omit it and mints resolve as `unavailable`
   * rather than being charged off the cart's snapshot — the same fail-closed choice as `rate` above, and it
   * is what keeps a client that has not wired the store path from charging one.
   */
  resolveStore?: StoreResolver
): Promise<CartReview> {
  const buyable: ResolvedLine[] = []
  const unavailable: CatalogItem[] = []
  const own: CatalogItem[] = []

  for (const item of items) {
    // Guarded per row: ANY failure (a resolve error, a malformed trade with an empty `received`, a bad
    // amount) classifies the row as unavailable rather than throwing out of reviewCart — one bad row must
    // never abort the basket. A basket cares only whether a row is chargeable, so 'gone' and 'no-price'
    // land in the same bucket; the single-item checkout is where they read differently.
    try {
      const outcome = await resolveLine(item, buyerAddress, resolve, rate, resolveStore)
      if (outcome.status === 'buyable') buyable.push(outcome.line)
      else if (outcome.status === 'own') own.push(item)
      else unavailable.push(item)
    } catch {
      unavailable.push(item)
    }
  }

  // Live total sums each buyable line's per-unit credit price × its quantity.
  const liveTotalCredits = buyable.reduce((sum, line) => sum + line.priceCredits * line.quantity, 0)
  const orderChanged =
    unavailable.length > 0 || own.length > 0 || buyable.some(line => line.priceCredits !== line.item.priceCredits)

  return { buyable, unavailable, own, liveTotalCredits, orderChanged }
}

/**
 * Split a failed checkout's reservations into "must not touch" and "release now", and name what was bought.
 *
 * A mixed basket needs one transaction per group, so a buyer can confirm the first wallet prompt and reject the
 * second — and by then the first is irreversibly on its way. That makes two different things true at once, and
 * this is where they are decided:
 *
 *  - a BROADCAST group's credits are spent for good, so its reservations must be left alone. Releasing them
 *    raises the balance by money already spent; the reconciler re-debits it once the squid indexes the
 *    consumption, and anything bought in the gap drives the balance negative.
 *  - an UNBROADCAST group's reservations must be released now, or that much of the buyer's balance stays
 *    stranded until the TTL expires.
 *  - a BROADCAST-THEN-REVERTED group consumed nothing (a revert rolls the whole call back), so it belongs with
 *    the second case — and its lines must NOT leave the cart, because the buyer bought nothing. This is why
 *    release and ownership are two separate inputs here rather than one `broadcast` set doing both jobs: using
 *    broadcast as a proxy for ownership empties the cart of a buyer whose transaction failed.
 *
 * Pure, and outside the page component, because the page cannot be tested at this level — the first version of
 * this logic shipped with the item-id half silently doing nothing, and no test could see it.
 *
 * A reservation carries the line it paid for, PAIRED at creation rather than tracked in a second structure
 * beside the salt list. Both halves are needed here, and two structures stay in step only by remembering to
 * write both: the first version did keep a parallel map, the caller never populated it, and that typechecked
 * and passed every test asserting on the salts while the cart cleanup silently did nothing (Jarvis P1). A
 * salt is still the only identifier that survives from the reservation through to the broadcast — it just
 * no longer travels alone.
 */
export type Reservation = {
  /** The ephemeral credit's salt, as the broadcast reports it. */
  salt: string
  /** The cart line this reservation pays for. */
  itemId: string
}

export function partitionReservations(opts: {
  /** Every reservation this checkout made, in order. */
  reservations: readonly Reservation[]
  /**
   * Salts that MAY have been consumed on-chain — broadcast, and not known to have reverted.
   *
   * This is the release decision, and it is deliberately the pessimistic set: anything in here is left alone.
   */
  spent: ReadonlySet<string>
  /**
   * Salts whose transaction MINED SUCCESSFULLY. This is the ownership decision — only these lines leave the
   * cart. Always a subset of `spent`; a broadcast that reverted is in neither.
   */
  settled: ReadonlySet<string>
}): { toRelease: string[]; boughtItemIds: string[] } {
  const { reservations, spent, settled } = opts
  const toRelease = reservations.filter(r => !spent.has(r.salt)).map(r => r.salt)
  // De-duplicated: a quantity-2 line reserves two salts, and the cart holds one row for it.
  const boughtItemIds = [...new Set(reservations.filter(r => settled.has(r.salt)).map(r => r.itemId))]
  return { toRelease, boughtItemIds }
}
