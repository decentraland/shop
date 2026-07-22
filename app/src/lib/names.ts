// Register a Decentraland NAME (primary) paid with the shop's USD-pegged credits.
//
// LIBRARY LAYER ONLY — no UI. This wires the money path so it can be de-risked before any screen is
// built. It mirrors the marketplace webapp's credit-paid claim (modules/ens/sagas.ts) but pays with
// the shop's ephemeral USD credit instead of the buyer's legacy MANA credits.
//
// HOW THE FLOW WORKS
// ------------------
// A NAME is registered by DCLControllerV2.register(name, beneficiary) on Ethereum L1 (100 MANA). The
// credits-server builds an Across cross-chain route that (a) bridges MANA Polygon→Ethereum and
// (b) runs approve + register + sweep as destination actions, returning a server-signed
// `externalCall` (a CreditExecutor.execute(...) call on Polygon) + `customExternalCallSignature`.
// The buyer submits it via CreditsManager.useCredits() on Polygon — the SAME contract the shop's
// item checkout uses — and the deposit is filled on Ethereum by an Across relayer.
//
// SIZING — WHY THE CREDIT ONLY COVERS 100 MANA (NOT 100 + BUFFER)
// ---------------------------------------------------------------
// GET /credits-name-route does NOT expose the required MANA input or the Across fee/slippage buffer:
// that buffer is embedded (opaque) inside `externalCall.data` and is fronted by the CreditExecutor's
// OWN on-chain MANA float (then reimbursed by the destination sweep) — it is NOT drawn from the
// credit. What the credit must cover is exactly the useCredits `maxCreditedValue`, which is the fixed
// 100 MANA name price (identical to the marketplace's PRICE_IN_WEI). So USD sizing depends only on
// the fixed name price + the oracle rate, NOT on the route response — the two server calls are
// independent. We size the ephemeral credit at 100 MANA worth of USD; authorizeUsdCredit rounds the
// charge up to a whole credit and signs the MANA cap with its own +2% oracle-drift buffer, so the
// returned credit value comes back at ~102 MANA ≥ 100 MANA. We still verify that invariant and abort
// (releasing the reservation) if a rare rate swing left it under-sized.
//
// BENEFICIARY: the endpoint registers the NAME to the AUTHENTICATED address (the signed-fetch
// identity) — it has no separate beneficiary param — so the beneficiary is always the buyer.

import signedFetch from 'decentraland-crypto-fetch'
import { ethers } from 'ethers'
import type { AuthIdentity } from '@dcl/crypto'
import { ChainId } from '@dcl/schemas'
import { config } from '~/config'
import { authorizeUsdCredit, cancelUsdIntents, type AuthorizedCredit } from '~/lib/credits'
import {
  GaslessUnavailableError,
  SettlementPendingError,
  useCreditsGasless,
  waitForSettlement
} from '~/lib/buy-gasless'
import { sendUseCredits } from '~/lib/buy'
import { idToSalt } from '~/lib/trade-encoding'
import { readManaUsdRate, manaWeiToUsdCents, type ManaRate } from '~/lib/mana-rate'
import { friendlyError } from '~/lib/errors'

// 100 MANA — the fixed DCLControllerV2.register cost and the useCredits maxCreditedValue. Matches the
// credits-server's NAME_PRICE_IN_WEI and the marketplace webapp's PRICE_IN_WEI.
export const NAME_PRICE_IN_WEI = '100000000000000000000'

// ---------------------------------------------------------------------------
// NAME string validation + availability (advisory search-time check)
// ---------------------------------------------------------------------------
// Decentraland NAME rules, mirroring the marketplace webapp's claim validation: 2–15 characters,
// ASCII alphanumeric only (a–z, A–Z, 0–9). No spaces, punctuation, emoji or unicode. The `.dcl.eth`
// suffix is presentation only — it's never part of the stored/registered name.

export const NAME_MIN_LENGTH = 2
export const NAME_MAX_LENGTH = 15
const NAME_ALLOWED = /^[a-zA-Z0-9]+$/

export type NameInvalidReason = 'empty' | 'too-short' | 'too-long' | 'invalid-chars'
export type NameValidation = { ok: true } | { ok: false; reason: NameInvalidReason }

// Validate a raw NAME the user typed. Order matters: an invalid character is reported before a
// length problem so the user sees the most specific fix first.
export function validateName(raw: string): NameValidation {
  const name = raw.trim()
  if (name.length === 0) return { ok: false, reason: 'empty' }
  if (!NAME_ALLOWED.test(name)) return { ok: false, reason: 'invalid-chars' }
  if (name.length < NAME_MIN_LENGTH) return { ok: false, reason: 'too-short' }
  if (name.length > NAME_MAX_LENGTH) return { ok: false, reason: 'too-long' }
  return { ok: true }
}

// Normalize keystrokes as the user types: drop anything that isn't allowed (incl. spaces) and cap the
// length. Keeps the input from ever holding a value that couldn't be registered.
export function sanitizeNameInput(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9]/g, '').slice(0, NAME_MAX_LENGTH)
}

export type NameAvailability = 'available' | 'taken'

/**
 * Advisory availability probe used by the search field. A NAME is "taken" when an ENS NFT with that
 * exact (case-insensitive) name already exists in the marketplace index. This is UNAUTHENTICATED and
 * cheap so it can run on every (debounced) keystroke without a sign-in.
 *
 * It is deliberately advisory: the AUTHORITATIVE checks are the credits-server (fetchNameCreditRoute
 * validates format + on-chain availability) and the on-chain register itself, both of which reject a
 * taken name at purchase time. A false "available" here can therefore never mint a duplicate.
 */
export async function checkNameAvailability(
  name: string,
  opts: { signal?: AbortSignal } = {}
): Promise<NameAvailability> {
  const qs = new URLSearchParams({ category: 'ens', search: name, first: '50' })
  const res = await fetch(`${config.nftApiUrl}/v1/nfts?${qs.toString()}`, { signal: opts.signal })
  if (!res.ok) throw new Error(`checkNameAvailability ${res.status}`)
  const body = (await res.json()) as { data?: Array<{ nft?: { name?: string } }> }
  const target = name.trim().toLowerCase()
  const taken = (body.data ?? []).some(row => (row.nft?.name ?? '').trim().toLowerCase() === target)
  return taken ? 'taken' : 'available'
}

// Across public app API base (deposit-status polling). Public value; overridable for tests/local.
const ACROSS_API_URL = 'https://app.across.to/api'

// Bridge provider for the cross-chain route. `across` gives us a `/deposit/status` we can poll for the
// destination fill + whether the embedded register actually ran; `axelar` is the legacy CORAL route.
export type NameRouteProvider = 'axelar' | 'across'

// The server-built, server-signed Polygon external call the buyer submits via useCredits.
export type NameRouteExternalCall = {
  target: string
  selector: string
  data: string
  expiresAt: number
  salt: string
}

// GET /credits-name-route response. The buffer/MANA-input is NOT here — it's baked into
// externalCall.data (see the sizing note above).
export type NameCreditRoute = {
  externalCall: NameRouteExternalCall
  customExternalCallSignature: string
  quoteId: string
  estimatedRouteDuration: number
  fromChainId: string
  toChainId: string
  provider?: NameRouteProvider
}

// The credits-server withholds the route (HTTP 503 + code ROUTE_COST_TOO_HIGH) when the Across bridge
// overhead exceeds what the executor can front — the route would revert on-chain. Distinct so callers
// can show a "temporarily unavailable due to network costs, retry later" message.
export class NameRouteCostTooHighError extends Error {
  constructor() {
    super('Name registration is temporarily unavailable due to high network costs')
    this.name = 'NameRouteCostTooHighError'
  }
}

// USD cents to reserve for a NAME: the value of 100 MANA at the oracle rate, rounded UP. The
// credits-server rounds this up to a whole credit and adds its own MANA-cap buffer when it signs.
export function sizeNameUsdCents(rate: ManaRate): number {
  return manaWeiToUsdCents(NAME_PRICE_IN_WEI, rate)
}

/**
 * GET /credits-name-route — the server validates the name (format + on-chain availability), builds
 * the Across/Axelar route and signs the external call. Signed-fetch (ADR-44): the authenticated
 * address is both the payer and the NAME beneficiary.
 */
export async function fetchNameCreditRoute(
  identity: AuthIdentity,
  name: string,
  opts: { chainId?: ChainId; provider?: NameRouteProvider } = {}
): Promise<NameCreditRoute> {
  const chainId = opts.chainId ?? ChainId.MATIC_MAINNET
  const provider = opts.provider ?? 'across'
  const url =
    `${config.creditsServerUrl}/credits-name-route` +
    `?name=${encodeURIComponent(name)}&chainId=${chainId}&provider=${provider}`
  const res = await signedFetch(url, { method: 'GET', identity, metadata: {} })
  if (!res.ok) {
    // Read the machine code before the generic throw so the cost-guard stays a distinct condition.
    let code: string | undefined
    try {
      code = ((await res.json()) as { code?: string })?.code
    } catch {
      // non-JSON body — fall through to the generic error
    }
    if (code === 'ROUTE_COST_TOO_HIGH') throw new NameRouteCostTooHighError()
    throw new Error(`fetchNameCreditRoute ${res.status}`)
  }
  return res.json() as Promise<NameCreditRoute>
}

// Build the CreditsManager.useCredits() args for a NAME: the ephemeral credit pays, and the
// server-signed route external call IS the operation (no accept([]) here). maxCreditedValue is the
// fixed 100 MANA name price; maxUncreditedValue is any gap the credit can't cover (0 in practice,
// since the credit is sized ≥ 100 MANA — the buyer never tops up with MANA).
export function buildNameUseCreditsArgs(credit: AuthorizedCredit, route: NameCreditRoute) {
  const available = ethers.BigNumber.from(credit.availableAmount)
  const credited = ethers.BigNumber.from(NAME_PRICE_IN_WEI)
  const uncredited = credited.sub(available)
  return {
    credits: [{ value: credit.amount, expiresAt: Number(credit.expiresAt), salt: idToSalt(credit.id) }],
    creditsSignatures: [credit.signature],
    externalCall: {
      target: route.externalCall.target,
      selector: route.externalCall.selector,
      data: route.externalCall.data,
      expiresAt: route.externalCall.expiresAt,
      salt: route.externalCall.salt
    },
    customExternalCallSignature: route.customExternalCallSignature,
    maxUncreditedValue: uncredited.isNegative() ? '0' : uncredited.toString(),
    maxCreditedValue: NAME_PRICE_IN_WEI
  }
}

// Across deposit status, polled from their public app API. `actionsSucceeded` tells us whether the
// embedded MulticallHandler actions (approve + register + sweep) ran — i.e. whether the NAME was
// actually minted. A filled deposit whose actions reverted means the bridged MANA went to the
// recovery wallet and the NAME was NOT registered.
export type AcrossNameStatus = {
  status: 'pending' | 'filled' | 'refunded' | 'expired'
  destinationTxHash: string | null
  actionsSucceeded: boolean
}

// Poll Across /deposit/status until the deposit reaches a terminal state (filled/refunded/expired) or
// we run out of attempts (returns the last `pending`). Origin chain is Polygon (137). Mirrors the
// marketplace webapp's pollAcrossRouteStatus; interval/attempts are injectable so tests stay fast.
export async function pollAcrossNameStatus(
  originTxHash: string,
  opts: { intervalMs?: number; maxAttempts?: number } = {}
): Promise<AcrossNameStatus> {
  const apiUrl = ACROSS_API_URL
  const intervalMs = opts.intervalMs ?? 10_000
  const maxAttempts = opts.maxAttempts ?? 60 // ~10 min at the default interval
  let last: AcrossNameStatus = { status: 'pending', destinationTxHash: null, actionsSucceeded: false }

  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(`${apiUrl}/deposit/status?originChainId=137&depositTxHash=${originTxHash}`)
      if (res.ok) {
        const data = (await res.json()) as {
          status?: string
          fillTx?: string
          fillTxnRef?: string
          actionsSucceeded?: boolean
        }
        const status = (data.status ?? 'pending').toLowerCase()
        const destinationTxHash = data.fillTx ?? data.fillTxnRef ?? null
        // Default true only for the `filled` field's absence; explicitly false blocks success below.
        const actionsSucceeded = data.actionsSucceeded !== false
        if (status === 'filled') return { status: 'filled', destinationTxHash, actionsSucceeded }
        if (status === 'refunded' || status === 'expired') {
          return { status: status as 'refunded' | 'expired', destinationTxHash: null, actionsSucceeded: false }
        }
        last = { status: 'pending', destinationTxHash, actionsSucceeded }
      }
    } catch {
      // transient network / not-indexed-yet — back off and retry
    }
    if (i < maxAttempts - 1) await new Promise(r => setTimeout(r, intervalMs))
  }
  return last
}

// Result of the orchestration. `registered` = filled + the register ran; `pending` = the origin tx or
// the Across fill hasn't confirmed within our window (the reservation is KEPT and the credits-server
// reconciler settles it against the indexed consumption — never released here).
export type NameRegistrationResult =
  | { status: 'registered'; originTxHash: string; destinationTxHash: string | null }
  | { status: 'pending'; originTxHash: string }

/**
 * Full orchestration: size + reserve a USD credit for 100 MANA, fetch the signed cross-chain route,
 * submit useCredits (gasless first, buyer-submitted fallback), wait for the origin tx, then poll
 * Across for the destination fill + register.
 *
 * Failure policy (avoids the double-spend the SettlementPendingError comment warns about):
 * - Anything BEFORE the origin useCredits confirms (route/authorize failure, under-sized credit, a
 *   reverted origin tx) → the credit was NOT consumed on-chain, so we RELEASE the reservation
 *   (cancelUsdIntents) and throw a friendly error.
 * - Origin tx still in flight (SettlementPendingError) → KEEP the reservation and return `pending`.
 * - Origin tx confirmed but Across didn't fill / the register reverted → the credit WAS consumed, so
 *   we NEVER release; throw a friendly error (the bridged MANA went to the recovery wallet).
 *
 * @throws Error with a localized, user-safe message (via friendlyError) on hard failure.
 */
export async function registerNameWithUsdCredits(opts: {
  name: string
  identity: AuthIdentity
  signer: ethers.Signer
  // The NAME beneficiary + payer. Must equal the signed-fetch identity's address (the endpoint
  // registers to the authenticated user). Defaults to the signer's address.
  beneficiary?: string
  chainId?: ChainId
  provider?: NameRouteProvider
  // Test seam: shrink the Across poll so specs don't wait on real timers.
  acrossPoll?: { intervalMs?: number; maxAttempts?: number }
}): Promise<NameRegistrationResult> {
  const { name, identity, signer } = opts
  const chainId = opts.chainId ?? ChainId.MATIC_MAINNET
  const provider = opts.provider ?? 'across'
  const buyer = (opts.beneficiary ?? (await signer.getAddress())).toLowerCase()

  let creditSalt: string | null = null
  let originConfirmed = false

  try {
    // 1) Size the USD reservation from the fixed name price at the live oracle rate.
    const rate = await readManaUsdRate(chainId)
    const usdCents = sizeNameUsdCents(rate)

    // 2) Fetch the signed cross-chain route (independent of sizing; short-lived quote).
    const route = await fetchNameCreditRoute(identity, name, { chainId, provider })

    // 3) Reserve the dollars + get the ephemeral credit (PENDING intent keyed by the credit salt).
    const authorized = await authorizeUsdCredit(identity, usdCents)
    creditSalt = authorized.credit.id

    // Invariant: the credit must cover the 100 MANA name price, or useCredits would try to charge the
    // buyer the shortfall in MANA (which they don't have) and revert. A rare rate swing between our
    // read and the server's could break it — release and bail rather than hand over a doomed tx.
    if (ethers.BigNumber.from(authorized.maxCreditedValue).lt(NAME_PRICE_IN_WEI)) {
      throw new Error('Credit under-sized for the name price')
    }

    // 4) Submit useCredits — gasless (relayer pays) first, buyer-submitted fallback.
    const args = buildNameUseCreditsArgs(authorized.credit, route)
    let originTxHash: string
    try {
      originTxHash = await useCreditsGasless({ chainId, buyer, signer, args })
    } catch (e) {
      if (!(e instanceof GaslessUnavailableError)) throw e
      // Gasless unavailable (flag off / contract account / relayer down) → buyer submits + pays gas.
      originTxHash = await sendUseCredits(chainId, args, signer)
    }

    // 5) Wait for the origin (Polygon) useCredits tx. Throws SettlementPendingError on timeout (keep
    // the reservation) or Error on revert (safe to release — no credit consumed).
    await waitForSettlement(originTxHash)
    originConfirmed = true

    // 6) Poll Across for the destination fill + register.
    if (provider === 'across') {
      const across = await pollAcrossNameStatus(originTxHash, opts.acrossPoll)
      if (across.status === 'pending') {
        // Bridge still in flight past our window — the origin tx is confirmed, so the credit is
        // consumed and the reconciler will settle. Report pending; DON'T release.
        return { status: 'pending', originTxHash }
      }
      if (across.status !== 'filled' || !across.actionsSucceeded) {
        // Filled-but-actions-failed or refunded/expired: the NAME was NOT minted and the MANA went to
        // recovery. The credit was consumed on-chain, so we must NOT release the reservation.
        throw new Error('The name could not be registered on Ethereum; your funds were recovered.')
      }
      return { status: 'registered', originTxHash, destinationTxHash: across.destinationTxHash }
    }
    // Axelar path isn't polled here (no /deposit/status equivalent wired in this lib) — the origin tx
    // is confirmed and the reconciler settles; report pending so the caller can track it elsewhere.
    return { status: 'pending', originTxHash }
  } catch (e) {
    // Origin tx still in flight → keep the reservation and surface it as pending, not a failure.
    if (e instanceof SettlementPendingError) {
      return { status: 'pending', originTxHash: e.txHash }
    }
    // Release the reservation ONLY when the credit was not (yet) consumed on-chain. Once the origin
    // useCredits confirms, releasing would let the buyer keep the credits after paying — never do it.
    if (creditSalt && !originConfirmed) {
      await cancelUsdIntents(identity, [creditSalt]).catch(() => {})
    }
    if (e instanceof NameRouteCostTooHighError) throw e
    throw new Error(friendlyError(e, "Couldn't register the name. Please try again.", { sale: true }))
  }
}
