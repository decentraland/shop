import signedFetch from 'decentraland-crypto-fetch'
import type { AuthIdentity } from '@dcl/crypto'
import { config } from '~/config'

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
  tradeId?: string
): Promise<AuthorizeResult> {
  const url = `${config.creditsServerUrl}/credits/authorize`
  const res = await signedFetch(url, {
    method: 'POST',
    identity,
    metadata: {},
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usdPriceCents, tradeId })
  })
  if (!res.ok) throw new Error(`authorizeUsdCredit ${res.status}: ${await res.text()}`)
  return res.json() as Promise<AuthorizeResult>
}

// One row of the buyer's Shop purchase history (a USD purchase intent). SETTLED = confirmed on-chain;
// PENDING = reserved, awaiting confirmation; EXPIRED = released (cancelled/timed out).
export type PurchaseRecord = {
  id: string
  tradeId: string | null
  usdCents: number
  credits: number
  status: 'PENDING' | 'SETTLED' | 'EXPIRED'
  createdAt: number
  manaSettledWei: string | null
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
  const json = (await res.json()) as { purchases?: PurchaseRecord[]; total?: number }
  const items = json.purchases ?? []
  const skip = opts?.skip ?? 0
  const first = opts?.first ?? items.length
  const total =
    typeof json.total === 'number' ? json.total : skip + items.length + (first > 0 && items.length >= first ? 1 : 0)
  return { items, total }
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
