import signedFetch from 'decentraland-crypto-fetch'
import type { AuthIdentity } from '@dcl/crypto'
import { config } from '~/config'
import type { Payout } from '~/lib/payouts'

export type ServerCredit = {
  id: string
  userAddress: string
  amount: string // wei → on-chain `value`
  availableAmount: string // wei
  status: 'available' | 'partially_used' | 'fully_used'
  contract: string
  timestamp: number
  signature: string // → creditsSignatures[]
  seasonId: number | null
  expiresAt: number // unix seconds → on-chain `expiresAt`
  creditSource?: string
}

// The USD balance block (present when the shop USD-credits feature flag is on).
export type UsdBalance = { balanceCents: number; credits: number }

export type UserCreditsResponse = {
  credits: ServerCredit[]
  totalCredits: number
  totals: { expiring: number; nonExpiring: number }
  usd?: UsdBalance
}

// Signed-fetch (ADR-44): the credits-server requires the requester to be the address in the path.
export async function getUserCredits(address: string, identity: AuthIdentity): Promise<UserCreditsResponse> {
  const url = `${config.creditsServerUrl}/users/${address.toLowerCase()}/credits`
  const res = await signedFetch(url, { method: 'GET', identity, metadata: {} })
  if (!res.ok) throw new Error(`getUserCredits ${res.status}: ${await res.text()}`)
  return res.json() as Promise<UserCreditsResponse>
}

// The user's spendable balance in fixed USD credits (1 credit = $0.10). Reads the `usd` block
// from GET /credits; defaults to 0 when the feature is off / no balance yet.
export async function getUsdBalance(address: string, identity: AuthIdentity): Promise<UsdBalance> {
  const { usd } = await getUserCredits(address, identity)
  return usd ?? { balanceCents: 0, credits: 0 }
}

// A single-use, per-purchase ephemeral credit signed by the credits-server (see
// shop/design/CREDITS_CANONICAL_MODEL.md). Shaped so buyWithCredits can spend it directly.
export type AuthorizedCredit = {
  id: string
  amount: string // MANA wei → on-chain credit `value`
  availableAmount: string
  expiresAt: number // unix seconds
  signature: string
  contract: string
}

export type AuthorizeResult = {
  credit: AuthorizedCredit
  maxCreditedValue: string // MANA wei the server sized for this purchase
  usdCents: number
  oracleRate: string
}

// Authorizes ONE item purchase paid with USD credits: the server checks the balance, sizes the
// MANA at the oracle, signs an ephemeral credit and reserves the dollars (PENDING intent). The
// returned credit is submitted via CreditsManager.useCredits() (see lib/buy.ts).
export async function authorizeUsdCredit(
  identity: AuthIdentity,
  usdPriceCents: number,
  tradeId?: string,
  // What is being bought, as opposed to how it settles. Recorded on the intent so the buyer's purchase
  // history can name it: a CollectionStore mint has no trade, so this is the only thing the Activity feed
  // can resolve a name and thumbnail from. The server accepts it only as a complete pair.
  item?: { contractAddress: string; itemId: string }
): Promise<AuthorizeResult> {
  const url = `${config.creditsServerUrl}/credits/authorize`
  const res = await signedFetch(url, {
    method: 'POST',
    identity,
    metadata: {},
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usdPriceCents, tradeId, ...(item ? item : {}) })
  })
  if (!res.ok) throw new Error(`authorizeUsdCredit ${res.status}: ${await res.text()}`)
  return res.json() as Promise<AuthorizeResult>
}

// One row of the buyer's Shop purchase history (a USD purchase intent). SETTLED = confirmed on-chain;
// PENDING = reserved, awaiting confirmation; EXPIRED = released (cancelled/timed out).
export type PurchaseRecord = {
  id: string
  tradeId: string | null
  /**
   * What this purchase bought, when the server recorded it. A trade-backed line can be resolved through
   * `tradeId`, but a CollectionStore mint has no trade, so this is the only identity it has — without it the
   * Activity feed can render such a line only as a nameless "Item".
   *
   * Null on rows written before the server recorded this, and absent entirely from an older server.
   */
  contractAddress: string | null
  itemId: string | null
  usdCents: number
  credits: number
  status: 'PENDING' | 'SETTLED' | 'EXPIRED'
  createdAt: number
  manaSettledWei: string | null
  // Settlement tx hash, when the server exposes it. A cart of N items authorizes N separate intents
  // but settles them in ONE on-chain accept([...]) tx, so all lines of one cart share this hash — the
  // strongest signal for grouping them back into a single order (see lib/purchases.ts). Optional
  // because older servers don't serialize it; grouping falls back to createdAt proximity then.
  txHash: string | null
}

// The buyer's purchase history (paginated). Defaults to confirmed purchases; `all` also returns
// pending/expired. Returns `{ items, total }`; `total` comes from the server, with a fallback for an
// older server that doesn't send it (assume there's another page whenever we got a full one).
export async function fetchUserPurchases(
  address: string,
  identity: AuthIdentity,
  opts?: { all?: boolean; first?: number; skip?: number }
): Promise<{ items: PurchaseRecord[]; total: number }> {
  const qs = new URLSearchParams()
  if (opts?.all) qs.set('status', 'all')
  if (opts?.first != null) qs.set('limit', String(opts.first))
  if (opts?.skip != null) qs.set('offset', String(opts.skip))
  const q = qs.toString()
  const url = `${config.creditsServerUrl}/users/${address.toLowerCase()}/purchases${q ? `?${q}` : ''}`
  const res = await signedFetch(url, { method: 'GET', identity, metadata: {} })
  if (!res.ok) throw new Error(`fetchUserPurchases ${res.status}: ${await res.text()}`)
  type RawPurchase = PurchaseRecord & { transactionHash?: string | null; txHash?: string | null }
  const json = (await res.json()) as { purchases?: RawPurchase[]; total?: number }
  // Normalise the settlement hash across the two field names servers have used (`txHash` /
  // `transactionHash`) so grouping has one field to read; null when neither is present.
  const items: PurchaseRecord[] = (json.purchases ?? []).map(p => ({
    ...p,
    txHash: p.txHash ?? p.transactionHash ?? null,
    // An older server omits these entirely — normalise `undefined` to null so every consumer has one
    // absent-value to check instead of two.
    contractAddress: p.contractAddress ?? null,
    itemId: p.itemId ?? null
  }))
  const skip = opts?.skip ?? 0
  const first = opts?.first ?? items.length
  const total =
    typeof json.total === 'number' ? json.total : skip + items.length + (first > 0 && items.length >= first ? 1 : 0)
  return { items, total }
}

// One credit-pack (top-up) purchase: the buyer paid money (via the Stripe pack checkout) and received
// `credits`. Distinct from an item PurchaseRecord — a top-up carries no tradeId; it credits the USD
// balance. `usdCents` is what they paid; `credits` is what they got.
/**
 * The credits-server's OWN status vocabulary, not this app's. Source of truth is a CHECK constraint on its
 * `stripe_orders` table: a row is created `processing` by POST /credits/checkout — i.e. when the pack is
 * CLICKED, before any payment — then `crediting` → `credited` by the Stripe webhook, or `failed`.
 *
 * Do NOT reuse PurchaseRecord's PENDING/SETTLED/EXPIRED here. That is a different endpoint's vocabulary,
 * and copying it into this type (they are declared a few lines apart) silently broke every status check
 * downstream: none of them could ever match, so dead orders were never filtered out of the Activity feed
 * and every row rendered as "Completed". The compiler cannot catch that — the type IS the lie.
 */
export type CreditOrderStatus = 'processing' | 'crediting' | 'credited' | 'failed' | 'abandoned'

export type CreditOrder = {
  id: string
  credits: number
  usdCents: number
  status: CreditOrderStatus
  createdAt: number
}

/**
 * A credit order's status as the Activity feed's pill vocabulary. Keeps the server's wording out of the
 * components, and gives the mapping one testable home instead of an equality check at each render site.
 */
export function creditOrderPill(status: CreditOrderStatus): 'SETTLED' | 'PENDING' | 'FAILED' {
  if (status === 'credited') return 'SETTLED'
  // 'abandoned' is a checkout that was opened and never paid, retired by the server on a timer. The
  // Activity feed drops it entirely, so this is only reached if some other surface renders such an order
  // directly. 'FAILED' is the honest bucket of the three: terminal, and no credits were ever granted.
  if (status === 'failed' || status === 'abandoned') return 'FAILED'
  // 'processing' (checkout opened, possibly abandoned) and 'crediting' (paid, grant in flight) are both
  // "not money in the balance yet", which is all the pill needs to say.
  return 'PENDING'
}

// The buyer's credit-pack purchase (top-up) history, paginated, newest first.
//
// Backed by credits-server `GET /users/:address/credit-orders` (signed fetch, ADR-44), which mirrors
// the `/users/:address/purchases` convention and returns `{ orders: CreditOrder[], total }`. The
// request is signed so the history stays private — the server 403s unless the path address matches
// the authenticated signer. Defensive: ANY non-OK (incl. a 404 on an env where the endpoint isn't
// deployed yet) resolves to an empty list, so the Activity feed just shows no credit rows instead of
// erroring.
export async function fetchUserCreditOrders(
  address: string,
  identity: AuthIdentity,
  opts?: { first?: number; skip?: number }
): Promise<{ items: CreditOrder[]; total: number; payouts: Payout[] }> {
  const qs = new URLSearchParams()
  if (opts?.first != null) qs.set('limit', String(opts.first))
  if (opts?.skip != null) qs.set('offset', String(opts.skip))
  const q = qs.toString()
  const url = `${config.creditsServerUrl}/users/${address.toLowerCase()}/credit-orders${q ? `?${q}` : ''}`
  try {
    const res = await signedFetch(url, { method: 'GET', identity, metadata: {} })
    if (!res.ok) {
      void res.body?.cancel()
      return { items: [], total: 0, payouts: [] }
    }
    // `earnings` is credits-server's additive seller-payout block (see its get-user-credit-orders
    // handler). It is absent on an older deployment, which reads the same as "this seller has no
    // treasury payouts" — sale rows then fall back to the direct-MANA display, which is what those
    // sales actually were.
    const json = (await res.json()) as {
      orders?: CreditOrder[]
      total?: number
      earnings?: { items?: Payout[] }
    }
    const items = json.orders ?? []
    const payouts = json.earnings?.items ?? []
    const skip = opts?.skip ?? 0
    const first = opts?.first ?? items.length
    const total =
      typeof json.total === 'number' ? json.total : skip + items.length + (first > 0 && items.length >= first ? 1 : 0)
    return { items, total, payouts }
  } catch {
    return { items: [], total: 0, payouts: [] }
  }
}

// Releases reserved dollars from PENDING intents (by ephemeral credit id / salt) when a client-side
// checkout fails — so the balance isn't stuck until the TTL. No-op for an empty list.
export async function cancelUsdIntents(identity: AuthIdentity, salts: string[]): Promise<number> {
  if (salts.length === 0) return 0
  const url = `${config.creditsServerUrl}/credits/authorize/cancel`
  const res = await signedFetch(url, {
    method: 'POST',
    identity,
    metadata: {},
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ salts })
  })
  if (!res.ok) throw new Error(`cancelUsdIntents ${res.status}: ${await res.text()}`)
  const json = (await res.json()) as { released?: number }
  return json.released ?? 0
}

export type DevMintUsdResult = { id: string; usdCents: number; balanceCents: number; credits: number }

// DEV ONLY — needs ALLOW_DEV_MINT=true. Tops up the USD balance (simulates a Stripe pack purchase).
export async function devMintUsd(address: string, usdCents = 1000): Promise<DevMintUsdResult> {
  const res = await fetch(`${config.creditsServerUrl}/dev/mint-usd`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address: address.toLowerCase(), usdCents })
  })
  if (!res.ok) throw new Error(`devMintUsd ${res.status}: ${await res.text()}`)
  return res.json() as Promise<DevMintUsdResult>
}

export type DevMintResult = { signature: string; expiresAt: number; seasonId: number | null; creditId: string }

// DEV ONLY — needs ALLOW_DEV_MINT=true on the credits-server. Grants a spendable test credit.
export async function devMintCredit(address: string, amount = 100): Promise<DevMintResult> {
  const res = await fetch(`${config.creditsServerUrl}/dev/mint-credit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address: address.toLowerCase(), amount, reason: 'shop dev mint' })
  })
  if (!res.ok) throw new Error(`devMintCredit ${res.status}: ${await res.text()}`)
  return res.json() as Promise<DevMintResult>
}
