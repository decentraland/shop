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
  sendUseCreditsGasless,
  waitForSettlement
} from '~/lib/buy-gasless'
import { sendUseCredits } from '~/lib/buy'
import { idToSalt } from '~/lib/trade-encoding'
import { readManaUsdRate, manaWeiToUsdCents, type ManaRate } from '~/lib/mana-rate'
import { friendlyError } from '~/lib/errors'
import { t } from '~/intl/i18n'
import { captureError } from '~/lib/monitoring'
import { getLatestOffChainMarketplaceContract } from '~/lib/marketplace'
import { AuthorizationKind, ensureAuthorization } from '~/lib/authorizations'
import { isWrongNetworkError, requireChain } from '~/lib/network'
import { canPayGasItself } from '~/lib/wallet-kind'
import type { ProviderType } from '@dcl/schemas'
import { ContractName, getContract } from 'decentraland-transactions'
// Types only: the module itself is loaded on demand (see loadCrossChain), because the SDK under it is large and
// only the Polygon MANA rail needs it.
import type { AxelarProvider, FromAmountParams, RouteResponse } from 'decentraland-transactions/crossChain'

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

// DCLRegistrar on Ethereum — the SAME contract the register hits. Its `available(name)` view is the
// authoritative availability check (the marketplace webapp reads this contract too). The read is public
// so it runs straight from the browser (no sign-in). WHICH Ethereum depends on the shop env: prod
// (config.chainId = Polygon mainnet) → Ethereum mainnet; dev/stg (Amoy) → Sepolia. Availability MUST be
// checked on the same network the register targets, or a name looks free/taken on the wrong chain.
const DCL_REGISTRAR_ABI = ['function available(string _subdomain) view returns (bool)']
const NAME_REGISTRAR = {
  mainnet: { rpc: 'https://rpc.decentraland.org/mainnet', address: '0x2a187453064356c898cae034eaed119e1663acb8' },
  sepolia: { rpc: 'https://rpc.decentraland.org/sepolia', address: '0x7518456ae93eb98f3e64571b689c626616bb7f30' }
}

// `available` is the only method we call — type it so the contract read isn't an `any` call.
type DclRegistrarContract = ethers.Contract & {
  available(subdomain: string): Promise<boolean>
}

function nameRegistrar() {
  // config.chainId is a plain number (Number(...) of the env value), so compare against the enum's
  // numeric value rather than the enum member — they share no enum type.
  return config.chainId === Number(ChainId.MATIC_MAINNET) ? NAME_REGISTRAR.mainnet : NAME_REGISTRAR.sepolia
}

/**
 * Authoritative availability check: `DCLRegistrar.available(name)` on Ethereum L1 — the exact gate the
 * on-chain register enforces, so it never disagrees with what you can actually claim. (The previous
 * NFT-index probe was fuzzy and reported taken names as available.) `true` → claimable, `false` → taken.
 */
export async function checkNameAvailability(
  name: string,
  opts: { signal?: AbortSignal } = {}
): Promise<NameAvailability> {
  const { rpc, address } = nameRegistrar()
  const provider = new ethers.providers.JsonRpcProvider(rpc)
  const registrar = new ethers.Contract(address, DCL_REGISTRAR_ABI, provider) as DclRegistrarContract
  console.info(`[names] availability check → DCLRegistrar(${address}).available("${name}") on ${rpc}`)
  const isAvailable = await registrar.available(name)
  // ethers has no AbortSignal, so a stale (superseded) check can still resolve — mimic fetch's abort so
  // the caller's AbortError guard discards it and only the latest keystroke's result is applied.
  if (opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  console.info(`[names] "${name}" available=${isAvailable}`)
  return isAvailable ? 'available' : 'taken'
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

/**
 * The credit was consumed on-chain but the NAME was NOT minted: the deposit was refunded or expired, or it
 * filled and the destination actions reverted, sending the bridged MANA to the recovery wallet.
 *
 * Typed so it can be rethrown UNWRAPPED, like NameRouteCostTooHighError. Routed through the generic
 * friendlyError fallback it would reach the buyer as "please try again" — advice that costs them a second
 * credit for a failure that is not theirs to retry, and that never mentions where their money went.
 */
export class NameNotRegisteredError extends Error {
  constructor() {
    super('The name could not be registered on Ethereum; your funds were recovered.')
    this.name = 'NameNotRegisteredError'
  }
}

/**
 * The relayer gave no usable response, so whether the credit was spent is UNKNOWN — the meta-transaction
 * may already be in flight.
 *
 * Distinct from NameNotRegisteredError, which knows the answer. Here retrying is the one action that can
 * genuinely double-spend: the first attempt may not have mined, so the name still reads as free, the route
 * re-fetch succeeds, and a second credit is authorized against a registration that then lands.
 */
export class NameSettlementUnknownError extends Error {
  constructor() {
    super("We couldn't confirm whether the purchase went through.")
    this.name = 'NameSettlementUnknownError'
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
  const chainId = opts.chainId ?? config.chainId
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
  // `null` = Across did not report it. Kept distinct from `false` because the two mean opposite things to a
  // buyer: `false` says the MANA is in the recovery wallet, `null` says we do not know yet. Collapsing them
  // into a boolean forces a guess, and both guesses tell someone a story about their money that may be wrong.
  actionsSucceeded: boolean | null
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
  let last: AcrossNameStatus = { status: 'pending', destinationTxHash: null, actionsSucceeded: null }

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
        // Carried through as-is. Coercing a missing field to `true` (what `!== false` does) is what turns an
        // unreported outcome into a claimed success downstream — the reading that tells a buyer their NAME
        // was minted when nothing says it was.
        const actionsSucceeded = typeof data.actionsSucceeded === 'boolean' ? data.actionsSucceeded : null
        if (status === 'filled') return { status: 'filled', destinationTxHash, actionsSucceeded }
        if (status === 'refunded' || status === 'expired') {
          return { status: status, destinationTxHash: null, actionsSucceeded: false }
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
/**
 * Where a registration has got to, for the screen watching it.
 *
 * These are not cosmetic increments — they last wildly different amounts of time. `awaiting-confirmation`
 * ends the moment the buyer signs; `registering` is the cross-chain bridge and runs for MINUTES. Collapsing
 * them into one message leaves "Confirm to continue" on screen long after the buyer confirmed, which reads
 * as a stuck purchase.
 */
export type NameRegistrationStage = 'preparing' | 'awaiting-confirmation' | 'confirming' | 'registering'

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
  /**
   * Pay part of the NAME with the buyer's own Polygon MANA instead of credits.
   *
   * The cents to reserve — anything short of the full price leaves a gap the CreditsManager pulls from the
   * buyer's wallet as `maxUncreditedValue`, exactly as the item's mixed rail does. It cannot be zero: the
   * registration runs through a server-signed external call that only `useCredits` can make, and that
   * reverts with `NoCredits()` on an empty credits array. So a NAME is always at least one credit.
   *
   * Omitted (the default) reserves the whole price and spends no MANA.
   */
  creditsCents?: number
  /**
   * The most MANA this purchase may pull, as it was SHOWN to the buyer.
   *
   * The gap is derived from a fresh oracle read at submit, while the figure on screen came from a rate
   * cached for up to a minute. Without a cap those two disagree silently and the contract pulls the
   * difference: an 11% MANA move turns a screen that said 7.41 into a 15 MANA charge. This is the mixed
   * rail's equivalent of the credits-only invariant below — refuse and release rather than overspend.
   */
  maxManaWei?: bigint
  // Test seam: shrink the Across poll so specs don't wait on real timers.
  acrossPoll?: { intervalMs?: number; maxAttempts?: number }
  // Progress for the UI. See NameRegistrationStage — the phases differ by MINUTES, so a screen that cannot
  // tell them apart ends up asking for a confirmation the buyer already gave, for the whole bridge wait.
  onProgress?: (stage: NameRegistrationStage) => void
}): Promise<NameRegistrationResult> {
  const { name, identity, signer } = opts
  // Never let a caller's render break the money path: this is only for what the screen says.
  const progress = (stage: NameRegistrationStage) => {
    try {
      opts.onProgress?.(stage)
    } catch {
      /* reporting progress must not abort a purchase */
    }
  }
  const chainId = opts.chainId ?? config.chainId
  const provider = opts.provider ?? 'across'
  const buyer = (opts.beneficiary ?? (await signer.getAddress())).toLowerCase()

  let creditSalt: string | null = null
  /**
   * How much we know about the origin transaction, and therefore whether releasing the reservation is safe.
   *
   * `unobservable` is the case two booleans could not express cleanly: the credit MAY have been consumed
   * without us ever seeing a tx hash. Only `unconfirmed` may be released — the other two would hand back
   * credits for a registration that lands anyway. One variable rather than a pair so "confirmed AND
   * unobservable" cannot be written at all.
   */
  let originState: 'unconfirmed' | 'confirmed' | 'unobservable' = 'unconfirmed'

  console.info('[names] register start', { name, buyer, chainId, provider })
  progress('preparing')
  try {
    // 1) Size the USD reservation from the fixed name price at the live oracle rate.
    // A name registration settles on the DCLRegistrar, not a marketplace, so there is no trade contract to
    // price against — this is purely the reference MANA/USD rate. Resolved on config.chainId rather than the
    // caller's, because readManaUsdRate dials config.rpcUrl and a marketplace from another chain has no
    // contract there to answer.
    const rate = await readManaUsdRate(getLatestOffChainMarketplaceContract(config.chainId).address)
    const fullPriceCents = sizeNameUsdCents(rate)
    // A caller paying part in MANA reserves less; never more than the price, and never nothing (NoCredits).
    const usdCents =
      opts.creditsCents != null ? Math.max(1, Math.min(Math.trunc(opts.creditsCents), fullPriceCents)) : fullPriceCents
    const payingWithMana = usdCents < fullPriceCents
    console.info('[names] step 1/6 sized reservation', { usdCents, fullPriceCents, payingWithMana, manaRate: rate })

    // 2) Fetch the signed cross-chain route (independent of sizing; short-lived quote).
    const route = await fetchNameCreditRoute(identity, name, { chainId, provider })
    console.info('[names] step 2/6 route fetched', {
      target: route.externalCall.target,
      selector: route.externalCall.selector,
      provider: route.provider,
      quoteId: route.quoteId
    })

    // 3) Reserve the dollars + get the ephemeral credit (PENDING intent keyed by the credit salt).
    // The name is passed so the purchase can be named in the buyer's history: a NAME has no trade and no
    // item, so it is the only identity the intent will ever carry.
    const authorized = await authorizeUsdCredit(identity, usdCents, undefined, undefined, name)
    creditSalt = authorized.credit.id
    console.info('[names] step 3/6 credit authorized', {
      creditId: authorized.credit.id,
      maxCreditedValue: authorized.maxCreditedValue
    })

    /**
     * Invariant, for a credits-only purchase: the credit must cover the 100 MANA price.
     *
     * Without it `useCredits` charges the shortfall to the buyer's MANA — which a credits-only buyer has
     * not agreed to spend and may not hold — and reverts. A rare rate swing between our read and the
     * server's could cause it, so release the reservation and bail rather than hand over a doomed tx.
     *
     * When the buyer IS paying part in MANA the gap is the point, and `buildNameUseCreditsArgs` turns it
     * into `maxUncreditedValue` — the cap the contract refunds against, so an over-estimate costs nothing.
     */
    if (!payingWithMana && ethers.BigNumber.from(authorized.maxCreditedValue).lt(NAME_PRICE_IN_WEI)) {
      throw new Error('Credit under-sized for the name price')
    }

    /**
     * 3b) Let the CreditsManager pull the MANA leg.
     *
     * Only for a mixed purchase: `useCredits` calls `safeTransferFrom(buyer, ...)` for the uncredited
     * value, which reverts without an allowance. Ordered BEFORE the submit so the buyer approves and pays
     * in one sitting, and skipped entirely when credits cover the price — a credits-only NAME must not
     * start asking for MANA permissions it will never use.
     */
    if (payingWithMana) {
      /**
       * Derived from `availableAmount`, the same field `buildNameUseCreditsArgs` uses — NOT
       * `maxCreditedValue`. They are equal today, but a partially consumed credit would make the real pull
       * bigger than the amount this asked an allowance for, and a leftover allowance would then pass the
       * check without an approve being sent, reverting inside `safeTransferFrom`.
       */
      const gapWei = ethers.BigNumber.from(NAME_PRICE_IN_WEI).sub(authorized.credit.availableAmount)
      if (opts.maxManaWei != null && gapWei.gt(opts.maxManaWei.toString())) {
        throw new Error('The MANA needed moved past what was agreed')
      }
      if (gapWei.gt(0)) {
        progress('awaiting-confirmation')
        await ensureAuthorization({
          auth: {
            kind: AuthorizationKind.Allowance,
            contractAddress: getContract(ContractName.MANAToken, chainId).address,
            spenderAddress: getContract(ContractName.CreditsManager, chainId).address,
            chainId
          },
          // The shop's Session always carries a JsonRpcSigner; the wider `ethers.Signer` on this function
          // predates the MANA leg and every call site passes the narrower one.
          signer: signer as ethers.providers.JsonRpcSigner,
          requiredWei: BigInt(gapWei.toString())
        })
        console.info('[names] step 3b/6 mana allowance ensured', { gapWei: gapWei.toString() })
      }
    }

    // 4) Submit useCredits — gasless (relayer pays) first, buyer-submitted fallback. A self-custody wallet
    // prompts here, so this is where the buyer has something to do.
    progress('awaiting-confirmation')
    const args = buildNameUseCreditsArgs(authorized.credit, route)
    let originTxHash: string
    try {
      originTxHash = await sendUseCreditsGasless({ chainId, buyer, signer, args })
    } catch (e) {
      if (!(e instanceof GaslessUnavailableError)) throw e
      /**
       * Only a REJECTION proves nothing was relayed. `relayer-unreachable` means there is no usable
       * response — a proxy 502, a reset connection — and the relayer may have submitted before it died.
       * Re-submitting the same credit then estimates gas against a consumed credit, which reverts with no
       * receipt and looks exactly like a pre-broadcast failure. So the fallback is not attempted, and the
       * reservation is marked unobservable so the catch below cannot release a credit that may be spent.
       *
       * Same call the BuyModal and MarketCheckout rails make; this one was falling back unconditionally.
       *
       * Typed rather than rethrown raw so the modal can suppress its retry button. Left as a
       * GaslessUnavailableError it reaches the generic fallback copy as "please try again", and a retry
       * here is the one action that can actually double-spend: the first meta-tx may still be in flight,
       * so the name is still free, the route re-fetch succeeds, and a second credit is authorized.
       */
      if (e.reason === 'relayer-unreachable') {
        originState = 'unobservable'
        const unknown: Error & { cause?: unknown } = new NameSettlementUnknownError()
        unknown.cause = e
        throw unknown
      }
      // Gasless unavailable (flag off / contract account / relayer down) → buyer submits + pays gas.
      originTxHash = await sendUseCredits(chainId, args, signer)
    }

    console.info('[names] step 4/6 useCredits submitted (Polygon origin tx)', { originTxHash })
    // Signed and broadcast: nothing left for the buyer to do, only the chain to catch up.
    progress('confirming')

    // 5) Wait for the origin (Polygon) useCredits tx. Throws SettlementPendingError on timeout (keep
    // the reservation) or Error on revert (safe to release — no credit consumed).
    await waitForSettlement(originTxHash)
    originState = 'confirmed'
    console.info('[names] step 5/6 origin tx confirmed', { originTxHash })

    // 6) Poll Across for the destination fill + register.
    if (provider === 'across') {
      // The long one — the bridge and the Ethereum mint, minutes rather than seconds.
      progress('registering')
      const across = await pollAcrossNameStatus(originTxHash, opts.acrossPoll)
      console.info('[names] step 6/6 across status', across)
      if (across.status === 'pending') {
        // Bridge still in flight past our window — the origin tx is confirmed, so the credit is
        // consumed and the reconciler will settle. Report pending; DON'T release.
        return { status: 'pending', originTxHash }
      }
      // A fill whose actions Across did not report on is an UNKNOWN outcome, not a success. Reported as
      // pending so the reconciler settles it and the buyer is told to check back — the honest answer, and
      // the only one that is recoverable whichever way it turns out. Claiming success here would send
      // someone looking for a NAME that may not exist; claiming failure would tell them their money was
      // recovered when it may have bought exactly what they asked for.
      if (across.status === 'filled' && across.actionsSucceeded === null) {
        console.warn('[names] across filled without reporting actionsSucceeded — reporting pending', {
          originTxHash
        })
        return { status: 'pending', originTxHash }
      }
      if (across.status !== 'filled' || across.actionsSucceeded !== true) {
        // Filled-but-actions-failed or refunded/expired: the NAME was NOT minted and the MANA went to
        // recovery. The credit was consumed on-chain, so we must NOT release the reservation.
        throw new NameNotRegisteredError()
      }
      return { status: 'registered', originTxHash, destinationTxHash: across.destinationTxHash }
    }
    // Axelar path isn't polled here (no /deposit/status equivalent wired in this lib) — the origin tx
    // is confirmed and the reconciler settles; report pending so the caller can track it elsewhere.
    return { status: 'pending', originTxHash }
  } catch (e) {
    // Surface the RAW error for debugging (the UI only shows the friendly message below).
    console.error('[names] register failed — raw error:', e, { name, buyer, originState })
    // Origin tx still in flight → keep the reservation and surface it as pending, not a failure.
    if (e instanceof SettlementPendingError) {
      return { status: 'pending', originTxHash: e.txHash }
    }
    // Release the reservation ONLY when the credit was not (yet) consumed on-chain. Once the origin
    // useCredits confirms, releasing would let the buyer keep the credits after paying — never do it.
    if (creditSalt && originState === 'unconfirmed') {
      await cancelUsdIntents(identity, [creditSalt]).catch(() => {})
    }
    if (e instanceof NameRouteCostTooHighError) throw e
    // Already specific and already user-safe, and the generic fallback below would replace it with "please
    // try again" — a second credit spent on a failure that is not the buyer's to retry.
    if (e instanceof NameNotRegisteredError || e instanceof NameSettlementUnknownError) throw e
    // Keep the original as `cause` so Sentry still gets the real failure behind the friendly copy.
    // Assigned rather than passed to the constructor: the TS lib target is ES2020, which predates
    // ErrorOptions (same approach as lib/store.ts).
    const failure: Error & { cause?: unknown } = new Error(
      friendlyError(e, "Couldn't register the name. Please try again.", { sale: true })
    )
    failure.cause = e
    throw failure
  }
}

/**
 * Register a NAME by paying with the buyer's own MANA on ETHEREUM — no credits, no bridge.
 *
 * The buyer approves MANA to DCLControllerV2 and calls `register` on L1, which is the same thing the
 * classic marketplace does for a crypto-paid claim. Nothing crosses a chain, so there is no route to sign,
 * no executor to front the bridge and no reconciler to settle: the NAME is minted in that one transaction.
 *
 * SELF-CUSTODY ONLY, and the reason is gas rather than taste. Every step here runs on Ethereum, where the
 * shop has no relayer — the wallet pays. A managed (social) wallet holds no ETH, so it would prompt for a
 * confirmation its owner cannot satisfy and revert with INSUFFICIENT_FUNDS. Callers gate on
 * `canPayGasItself(providerType)`; this throws if that gate was missed, rather than trusting it.
 *
 * The buyer's wallet must also BE on Ethereum. Unlike the Polygon rails, reads here cannot stand in for the
 * write: switching is the caller's job (`switchChain`) so the modal can explain it before the wallet asks.
 */
export async function registerNameWithEthereumMana(opts: {
  name: string
  signer: ethers.providers.JsonRpcSigner
  web3Provider: ethers.providers.Web3Provider
  providerType?: string | null
  /** The NAME beneficiary. Defaults to the signer's address. */
  beneficiary?: string
  onProgress?: (stage: NameRegistrationStage) => void
}): Promise<{ status: 'registered'; originTxHash: string }> {
  const { name, signer, web3Provider } = opts
  const progress = (stage: NameRegistrationStage) => {
    try {
      opts.onProgress?.(stage)
    } catch {
      /* reporting progress must not abort a purchase */
    }
  }
  const chainId = config.ethereumChainId
  const buyer = (opts.beneficiary ?? (await signer.getAddress())).toLowerCase()

  if (!canPayGasItself(opts.providerType as ProviderType | null | undefined)) {
    throw new Error('This wallet cannot pay its own gas on Ethereum')
  }

  console.info('[names] ethereum register start', { name, buyer, chainId })
  progress('preparing')
  try {
    // The wallet has to be ON Ethereum: this is a real L1 write, so a Polygon-pointed wallet would sign
    // against the wrong chain. Verified rather than switched — the caller switches, having said why.
    await requireChain(web3Provider, chainId)

    // 100 MANA to the controller. `ensureAuthorization` skips a sufficient existing allowance, so a repeat
    // buyer approves once.
    progress('awaiting-confirmation')
    await ensureAuthorization({
      auth: {
        kind: AuthorizationKind.Allowance,
        contractAddress: getContract(ContractName.MANAToken, chainId).address,
        spenderAddress: getContract(ContractName.DCLControllerV2, chainId).address,
        chainId
      },
      signer,
      requiredWei: BigInt(NAME_PRICE_IN_WEI)
    })

    const controller = getContract(ContractName.DCLControllerV2, chainId)
    const contract = new ethers.Contract(controller.address, controller.abi, signer) as ethers.Contract & {
      register(name: string, beneficiary: string): Promise<ethers.providers.TransactionResponse>
    }
    const tx = await contract.register(name, buyer)
    console.info('[names] ethereum register submitted', { txHash: tx.hash })

    // Mined on Ethereum IS the registration — there is no bridge to wait on afterwards, which is why this
    // rail never reports 'pending'.
    progress('confirming')
    const receipt = await tx.wait()
    if (receipt.status === 0) throw new Error('The registration was not completed')
    console.info('[names] ethereum register confirmed', { txHash: tx.hash })
    return { status: 'registered', originTxHash: tx.hash }
  } catch (e) {
    console.error('[names] ethereum register failed — raw error:', e, { name, buyer })
    const failure: Error & { cause?: unknown } = new Error(
      friendlyError(e, "Couldn't register the name. Please try again.", { sale: true })
    )
    failure.cause = e
    throw failure
  }
}

const QUOTE_RATE_LIMIT_RETRIES = 4

/**
 * Waits out Squid's per-address quote limit instead of failing on it. The API answers a second route quote
 * within about a second with a 429, and the library's safe-route loop asks again at once, so without this
 * every quote that needs a second pass fails.
 */
function waitOutQuoteRateLimit(provider: AxelarProvider): AxelarProvider {
  const getRoute = provider.squid.getRoute.bind(provider.squid)
  provider.squid.getRoute = async params => {
    for (let attempt = 0; ; attempt++) {
      try {
        return await getRoute(params)
      } catch (e) {
        const response = (e as { response?: { status?: number; data?: { retryAfter?: unknown } } } | null)?.response
        if (response?.status !== 429 || attempt >= QUOTE_RATE_LIMIT_RETRIES) throw e
        const seconds = Math.min(Math.max(Number(response.data?.retryAfter) || 1, 1), 5)
        await new Promise(resolve => setTimeout(resolve, seconds * 1000))
      }
    }
  }
  return provider
}

/** The cross-chain SDK, loaded on demand; a failed load is forgotten so the next attempt retries it. */
let crossChain: Promise<AxelarProvider> | null = null
function loadCrossChain(): Promise<AxelarProvider> {
  crossChain ??= import('decentraland-transactions/crossChain')
    .then(m => waitOutQuoteRateLimit(new m.AxelarProvider(config.squidApiUrl)))
    .catch((e: unknown) => {
      crossChain = null
      throw e
    })
  return crossChain
}

const SQUID_INTEGRATOR_ID = 'decentraland-sdk'

/**
 * The only spender and call target a route may name. Pinned rather than read from the API: the API picks the
 * amount too, so trusting it for the address would let it pick both sides of the approval.
 */
export const SQUID_ROUTER = '0xce16f69375520ab01377ce7b88f5ba8c48f8d666'

/** The most MANA a route may pull: the SDK's 1.5% sizing margin plus the 5% it may add to guarantee delivery. */
export const MAX_ROUTE_MANA_WEI = (BigInt(NAME_PRICE_IN_WEI) * 107n) / 100n

/** What the method step shows before the route is priced: the SDK's own first estimate. */
export const MANA_ALONE_ESTIMATE_WEI = (BigInt(NAME_PRICE_IN_WEI) * 1015n) / 1000n

// A backstop on the native value a route may carry, whatever the API says its fee is: well above an Axelar fee
// to Ethereum at a gas spike, well below a balance worth draining.
const MAX_ROUTE_VALUE_WEI = 300n * 10n ** 18n

// How far the MANA may drift up between the quote shown and the one sent.
const MANA_DRIFT_PERMILLE = 5n

export class NameRouteUnavailableError extends Error {
  constructor() {
    super('Paying this NAME in MANA is not available right now.')
    this.name = 'NameRouteUnavailableError'
  }
}

/** The route needs more than the buyer was shown. Nothing was sent. */
export class NameQuoteMovedError extends Error {
  constructor() {
    super('The amount needed moved past what was shown.')
    this.name = 'NameQuoteMovedError'
  }
}

/** The bridge gave the payment back. A retry is safe. */
export class NameRefundedError extends Error {
  constructor() {
    super('The NAME could not be registered and the payment was refunded.')
    this.name = 'NameRefundedError'
  }
}

export class NameManaShortError extends Error {
  constructor() {
    super('Not enough MANA for the NAME.')
    this.name = 'NameManaShortError'
  }
}

export class NameFeeShortError extends Error {
  constructor() {
    super('Not enough balance for the fee.')
    this.name = 'NameFeeShortError'
  }
}

export class NameTakenError extends Error {
  constructor() {
    super('The NAME is no longer available.')
    this.name = 'NameTakenError'
  }
}

/** A purchase of this NAME is still in progress in this browser. Paying again would pay twice. */
export class NameInFlightError extends Error {
  constructor() {
    super('A purchase of this NAME is still being completed.')
    this.name = 'NameInFlightError'
  }
}

/**
 * NAMEs with a purchase under way in this browser. The NAME reads as free on Ethereum until the bridge lands,
 * so only this can stop a second tab paying for it again. `sending` covers the wallet prompts and expires
 * quickly, in case the tab is closed on them; `sent` lasts until the bridge has had time to land.
 */
const IN_FLIGHT_KEY = 'dcl_shop_names_in_flight'
const IN_FLIGHT_TTL_MS = { sending: 10 * 60 * 1000, sent: 2 * 60 * 60 * 1000 }
type InFlight = Record<string, { at: number; phase: keyof typeof IN_FLIGHT_TTL_MS }>
function readInFlight(): InFlight {
  try {
    return JSON.parse(localStorage.getItem(IN_FLIGHT_KEY) ?? '{}') as InFlight
  } catch {
    return {}
  }
}
function writeInFlight(update: (all: InFlight) => void) {
  try {
    const all = readInFlight()
    update(all)
    localStorage.setItem(IN_FLIGHT_KEY, JSON.stringify(all))
  } catch {
    /* no storage: the availability check is all that is left */
  }
}
function isInFlight(name: string): boolean {
  const entry = readInFlight()[name.toLowerCase()]
  return entry != null && Date.now() - entry.at < (IN_FLIGHT_TTL_MS[entry.phase] ?? 0)
}
const markInFlight = (name: string, phase: keyof typeof IN_FLIGHT_TTL_MS) =>
  writeInFlight(all => void (all[name.toLowerCase()] = { at: Date.now(), phase }))
const clearInFlight = (name: string) => writeInFlight(all => void delete all[name.toLowerCase()])

/** What paying a NAME in Polygon MANA alone costs this buyer, right now. */
export type PolygonManaNameQuote = {
  /** The Polygon MANA the route pulls. */
  manaWei: bigint
  /** What it charges on top in Polygon's native token — never less than the value its transaction carries. */
  feeWei: bigint
  feeUsd: number | null
  /** The native balance the wallet must hold to send it: the value plus the gas each transaction reserves. */
  requiredNativeWei: bigint
  nativeBalanceWei: bigint
  route: RouteResponse
}

// `getSupportedTokens` declares its type through a path the pinned squid-types release does not ship.
type SquidToken = FromAmountParams['fromToken'] & { usdPrice?: number }

const SQUID_NATIVE_TOKEN = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
const ERC20_ALLOWANCE_ABI = ['function allowance(address owner, address spender) view returns (uint256)']

type RouteRequestGas = { value?: string; gasLimit?: string; maxFeePerGas?: string; gasPrice?: string }

type HookCall = {
  target?: string
  callData?: string
  callType?: unknown
  value?: unknown
  payload?: { tokenAddress?: string; inputPos?: unknown }
}
type ExpectedHookCall = { target: string; callData: string; callType: number; tokenAddress: string; inputPos: number }
type RouteExpectation = { polygonMana: string; ethereumMana: string; controller: string; hookCalls: ExpectedHookCall[] }

const ERC20_HOOK_ABI = [
  'function approve(address spender, uint256 amount)',
  'function transfer(address to, uint256 amount)'
]
// Squid's call types: a plain call, and one whose argument at `inputPos` becomes the router's whole balance.
const SQUID_CALL_DEFAULT = 0
const SQUID_CALL_FULL_TOKEN_BALANCE = 1

/**
 * The Ethereum calls `getRegisterNameRoute` builds, in order: approve the controller for the price (after
 * zeroing it on mainnet, whose MANA requires that), register the NAME to the buyer, then sweep the leftover
 * MANA back to them.
 */
function registerHookCalls(opts: {
  ethereumMana: string
  controller: { address: string; abi: object[] }
  name: string
  buyer: string
}): ExpectedHookCall[] {
  const erc20 = new ethers.utils.Interface(ERC20_HOOK_ABI)
  const controller = opts.controller.address.toLowerCase()
  const plain = (target: string, callData: string): ExpectedHookCall => ({
    target,
    callData: callData.toLowerCase(),
    callType: SQUID_CALL_DEFAULT,
    tokenAddress: SQUID_NATIVE_TOKEN,
    inputPos: 0
  })
  return [
    ...(config.ethereumChainId === Number(ChainId.ETHEREUM_MAINNET)
      ? [plain(opts.ethereumMana, erc20.encodeFunctionData('approve', [controller, 0]))]
      : []),
    plain(opts.ethereumMana, erc20.encodeFunctionData('approve', [controller, NAME_PRICE_IN_WEI])),
    plain(
      controller,
      new ethers.utils.Interface(opts.controller.abi).encodeFunctionData('register', [opts.name, opts.buyer])
    ),
    {
      target: opts.ethereumMana,
      callData: erc20.encodeFunctionData('transfer', [opts.buyer, 0]).toLowerCase(),
      callType: SQUID_CALL_FULL_TOKEN_BALANCE,
      tokenAddress: opts.ethereumMana,
      inputPos: 1
    }
  ]
}

function hookCallMatches(call: HookCall, expected: ExpectedHookCall): boolean {
  return (
    String(call.target).toLowerCase() === expected.target &&
    String(call.callData).toLowerCase() === expected.callData &&
    Number(call.callType) === expected.callType &&
    String(call.value) === '0' &&
    String(call.payload?.tokenAddress).toLowerCase() === expected.tokenAddress &&
    Number(call.payload?.inputPos) === expected.inputPos
  )
}

/**
 * Refuses a route that does not do what was asked. The API is a third party that picks every one of these
 * fields, and the buyer is about to approve and send them: the router and token it would approve, the amount
 * and value it would pull, and the Ethereum calls it would make with the bridged MANA.
 */
function assertRouteShape(route: RouteResponse, expected: RouteExpectation) {
  const { params, transactionRequest } = route.route
  const extra = params as { preHook?: unknown; toAddress?: unknown; postHook?: { calls?: HookCall[] } }
  const value = BigInt((transactionRequest as RouteRequestGas | undefined)?.value ?? '0')
  const calls = extra.postHook?.calls ?? []
  const problems = [
    transactionRequest?.target?.toLowerCase() !== SQUID_ROUTER && 'router',
    String(params.fromToken).toLowerCase() !== expected.polygonMana && 'token',
    String(params.fromChain) !== String(config.chainId) && 'chain',
    // The SDK approves and checks a pre-hook's fund token in place of `fromToken`.
    extra.preHook != null && 'prehook',
    BigInt(params.fromAmount) > MAX_ROUTE_MANA_WEI && 'amount',
    value > MAX_ROUTE_VALUE_WEI && 'value',
    String(params.toChain) !== String(config.ethereumChainId) && 'destination chain',
    String(params.toToken).toLowerCase() !== expected.ethereumMana && 'destination token',
    // Where the bridged MANA lands if the hook is skipped; the library names the controller.
    String(extra.toAddress).toLowerCase() !== expected.controller && 'destination address',
    (calls.length !== expected.hookCalls.length ||
      calls.some((call, i) => !hookCallMatches(call, expected.hookCalls[i]))) &&
      'hook calls'
  ].filter(Boolean)
  if (problems.length > 0) throw new Error(`Squid route rejected: ${problems.join(', ')}`)
}

/**
 * Prices a NAME paid entirely in the buyer's Polygon MANA with the marketplace's own calls: how much MANA
 * delivers the price, then the route for that amount (which may raise it, so the amount is read off the route).
 *
 * @throws NameRouteUnavailableError when no acceptable route can be built.
 */
export async function quoteNameWithPolygonMana(opts: { name: string; buyer: string }): Promise<PolygonManaNameQuote> {
  try {
    const provider = await loadCrossChain()
    await provider.init()
    const tokens = provider.getSupportedTokens() as unknown as SquidToken[]
    const onChain = (chainId: number, address: string) =>
      tokens.find(token => String(token.chainId) === String(chainId) && token.address.toLowerCase() === address)
    const polygonMana = getContract(ContractName.MANAToken, config.chainId).address.toLowerCase()
    const ethereumMana = getContract(ContractName.MANAToken, config.ethereumChainId).address.toLowerCase()
    const fromToken = onChain(config.chainId, polygonMana)
    const toToken = onChain(config.ethereumChainId, ethereumMana)
    if (!fromToken || !toToken) throw new Error('MANA is not routable between these chains')

    const fromAmount = Number(
      await provider.getFromAmount({ fromToken, toAmount: ethers.utils.formatEther(NAME_PRICE_IN_WEI), toToken })
    ).toFixed(6)
    const route = await provider.getRegisterNameRoute({
      name: opts.name,
      fromAddress: opts.buyer,
      fromAmount: ethers.utils.parseUnits(fromAmount, fromToken.decimals).toString(),
      fromChain: config.chainId,
      fromToken: fromToken.address,
      toAmount: NAME_PRICE_IN_WEI,
      toChain: config.ethereumChainId
    })
    const controller = getContract(ContractName.DCLControllerV2, config.ethereumChainId)
    assertRouteShape(route, {
      polygonMana,
      ethereumMana,
      controller: controller.address.toLowerCase(),
      hookCalls: registerHookCalls({ ethereumMana, controller, name: opts.name, buyer: opts.buyer })
    })

    const { estimate, params, transactionRequest } = route.route
    const gas = transactionRequest as RouteRequestGas
    const manaWei = BigInt(params.fromAmount)
    const read = new ethers.providers.JsonRpcProvider(config.rpcUrl)
    const mana = new ethers.Contract(fromToken.address, ERC20_ALLOWANCE_ABI, read) as ethers.Contract & {
      allowance(owner: string, spender: string): Promise<ethers.BigNumber>
    }
    const [nativeBalance, allowance, networkGasPrice] = await Promise.all([
      read.getBalance(opts.buyer),
      mana.allowance(opts.buyer, SQUID_ROUTER),
      read.getGasPrice()
    ])

    // Native costs only: a fee in MANA comes out of the amount bridged, so it is already in `fromAmount`.
    const nativeCosts = [...estimate.gasCosts, ...estimate.feeCosts]
      .filter(cost => cost.token.address.toLowerCase() === SQUID_NATIVE_TOKEN)
      .reduce((total, cost) => total + BigInt(cost.amount), 0n)
    const value = BigInt(gas.value ?? '0')
    // Whatever the estimate says, the screen never shows less than the transaction actually carries.
    const feeWei = nativeCosts > value ? nativeCosts : value
    const nativeUsd = onChain(config.chainId, SQUID_NATIVE_TOKEN)?.usdPrice
    const feeUsd = typeof nativeUsd === 'number' ? (Number(feeWei) / 1e18) * nativeUsd : null

    const gasPrice = BigInt(gas.maxFeePerGas ?? gas.gasPrice ?? networkGasPrice.toString())
    const reservePerTx = BigInt(gas.gasLimit ?? '0') * gasPrice
    // The router sends a missing approval with the bridge's own gas limit, so it reserves as much again.
    const transactions = BigInt(allowance.toString()) >= manaWei ? 1n : 2n

    return {
      manaWei,
      feeWei,
      feeUsd,
      requiredNativeWei: value + reservePerTx * transactions,
      nativeBalanceWei: BigInt(nativeBalance.toString()),
      route
    }
  } catch (e) {
    console.error('[names] polygon mana quote failed — raw error:', e, { name: opts.name })
    if (e instanceof Error && e.message.startsWith('Squid route rejected')) {
      captureError(e, { flow: 'name_polygon_mana', step: 'route_shape' })
    }
    const unavailable: Error & { cause?: unknown } = new NameRouteUnavailableError()
    unavailable.cause = e
    throw unavailable
  }
}

/**
 * The buyer's signer, recording the hash of the bridge transaction the moment the wallet returns it.
 *
 * ethers' `sendTransaction` broadcasts and then polls for the transaction; when that poll fails it throws with
 * `transactionHash` set — the bridge is out, but the call failed. Telling the two apart is what decides whether
 * a retry is safe, so the hash is taken from either outcome.
 */
function watchBridgeSend(signer: ethers.providers.JsonRpcSigner, onBridgeSent: (hash: string) => void) {
  let bridgeHash: string | null = null
  const record = (hash: string) => {
    bridgeHash = hash
    onBridgeSent(hash)
  }
  const watched = Object.create(signer) as ethers.providers.JsonRpcSigner
  watched.sendTransaction = async tx => {
    const isBridge = typeof tx.to === 'string' && tx.to.toLowerCase() === SQUID_ROUTER
    try {
      const sent = await signer.sendTransaction(tx)
      if (isBridge) record(sent.hash)
      return sent
    } catch (e) {
      const hash = (e as { transactionHash?: string }).transactionHash
      if (isBridge && hash) record(hash)
      throw e
    }
  }
  return { signer: watched, bridgeHash: () => bridgeHash }
}

/**
 * What a failed wait proves about a bridge that left the wallet. A sped-up replacement that mined IS the
 * purchase; a revert, or a replacement by anything else, proves it never ran; anything else says nothing.
 */
function waitOutcome(e: unknown): { landed: string } | 'not-run' | 'unknown' {
  const err = e as {
    code?: unknown
    cancelled?: boolean
    receipt?: { status?: number; transactionHash?: string } | null
  }
  if (err.code === 'TRANSACTION_REPLACED') {
    if (err.cancelled === false && err.receipt?.status === 1 && err.receipt.transactionHash) {
      return { landed: err.receipt.transactionHash }
    }
    return 'not-run'
  }
  if (err.receipt?.status === 0) return 'not-run'
  return 'unknown'
}

const WAIT_TIMEOUT_MS = 10 * 60 * 1000

// `needs_gas` is not terminal: express delivery usually covers it.
const SQUID_TERMINAL = new Set(['success', 'partial_success', 'failed_on_destination', 'refunded'])

/**
 * Asks the router how the bridge is doing until it settles or the window closes, with the same parameters as
 * the marketplace's own status poller. `unread` means no answer ever came back — not the same as "on its way".
 */
async function pollSquidNameStatus(
  provider: AxelarProvider,
  route: RouteResponse,
  originTxHash: string,
  opts: { intervalMs?: number; maxAttempts?: number } = {}
): Promise<string> {
  const intervalMs = opts.intervalMs ?? 10_000
  const maxAttempts = opts.maxAttempts ?? 60
  const query: Parameters<AxelarProvider['squid']['getStatus']>[0] & Record<string, string | undefined> = {
    transactionId: originTxHash,
    requestId: route.requestId,
    integratorId: SQUID_INTEGRATOR_ID,
    fromChainId: String(config.chainId),
    toChainId: String(config.ethereumChainId),
    quoteId: (route.route as { quoteId?: string }).quoteId
  }
  let last = 'unread'
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const status = await provider.squid.getStatus(query)
      const reading = String(status.squidTransactionStatus ?? 'ongoing')
      // The marketplace's poller knows the refund as `refund`; the SDK's enum as `refunded`.
      last = reading === 'refund' ? 'refunded' : reading
      if (SQUID_TERMINAL.has(last)) return last
    } catch (e) {
      if (last === 'unread' && i === 0) captureError(e, { flow: 'name_polygon_mana', step: 'bridge_status' })
    }
    if (i < maxAttempts - 1) await new Promise(r => setTimeout(r, intervalMs))
  }
  return last
}

/**
 * Registers a NAME paid entirely in the buyer's own Polygon MANA, through the route the marketplace uses.
 *
 * Self-custody only: there is no credit and so no relayer — the buyer's wallet sends the approval and the
 * bridge and pays their fees. The route is quoted again and held to what was shown, the NAME's availability
 * is checked, and the approval is exact.
 *
 * @throws NameQuoteMovedError, NameRouteUnavailableError, NameManaShortError, NameFeeShortError, NameTakenError,
 * NameInFlightError, NameRefundedError, NameNotRegisteredError, NameSettlementUnknownError, a WrongNetworkError,
 * or an Error with a user-safe message.
 */
export async function registerNameWithPolygonMana(opts: {
  name: string
  signer: ethers.providers.JsonRpcSigner
  web3Provider: ethers.providers.Web3Provider
  providerType?: string | null
  /** The MANA the buyer agreed to, as it was shown. */
  shownManaWei: bigint
  /** The fee the buyer was shown, in Polygon's native token. */
  shownFeeWei: bigint
  onProgress?: (stage: NameRegistrationStage) => void
  // Test seams: shrink the waits so specs don't sit on real timers.
  statusPoll?: { intervalMs?: number; maxAttempts?: number }
  waitTimeoutMs?: number
}): Promise<NameRegistrationResult & { manaWei: bigint }> {
  const { name, signer, web3Provider } = opts
  const progress = (stage: NameRegistrationStage) => {
    try {
      opts.onProgress?.(stage)
    } catch {
      /* reporting progress must not abort a purchase */
    }
  }
  let buyer = ''
  // Whether this attempt holds the NAME's in-flight mark, and whether a bridge has left the wallet under it.
  let claimed = false
  let bridgeLeft = false

  progress('preparing')
  try {
    buyer = (await signer.getAddress()).toLowerCase()
    if (!canPayGasItself(opts.providerType as ProviderType | null | undefined)) {
      throw new Error('This wallet cannot pay its own fees on Polygon')
    }
    console.info('[names] polygon mana register start', { name, buyer })
    if (isInFlight(name)) throw new NameInFlightError()
    // Claimed before anything is awaited, so a second tab cannot slip through while this one is still checking.
    markInFlight(name, 'sending')
    claimed = true
    await requireChain(web3Provider, config.chainId)

    const quote = await quoteNameWithPolygonMana({ name, buyer })
    const manaCap = opts.shownManaWei + (opts.shownManaWei * MANA_DRIFT_PERMILLE) / 1000n
    if (quote.manaWei > manaCap || quote.feeWei > (opts.shownFeeWei * 3n) / 2n) throw new NameQuoteMovedError()
    // The credits rail gets this check from the server; nothing else would make it here.
    if ((await checkNameAvailability(name)) !== 'available') throw new NameTakenError()
    const provider = await loadCrossChain()

    progress('awaiting-confirmation')
    // `sent` from the moment the wallet hands back the bridge's hash, however the rest of the call ends.
    const sends = watchBridgeSend(signer, () => {
      bridgeLeft = true
      markInFlight(name, 'sent')
    })
    let originTxHash: string
    let lostSight = false
    try {
      // `AxelarProvider.executeRoute`'s own call, with an exact approval and the bridge returned before its wait.
      const tx = (await provider.squid.executeRoute({
        route: quote.route.route,
        signer: sends.signer,
        executionSettings: { infiniteApproval: false }
      })) as unknown as ethers.providers.TransactionResponse
      console.info('[names] polygon mana bridge sent', { txHash: tx.hash })
      progress('confirming')
      originTxHash = tx.hash
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        const timedOut = new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error('Timed out waiting for the bridge')),
            opts.waitTimeoutMs ?? WAIT_TIMEOUT_MS
          )
        })
        const receipt = await Promise.race([tx.wait(), timedOut])
        originTxHash = receipt.transactionHash
      } catch (e) {
        const outcome = waitOutcome(e)
        if (outcome === 'not-run') {
          bridgeLeft = false
          throw e
        }
        if (outcome === 'unknown') lostSight = true
        else originTxHash = outcome.landed
      } finally {
        clearTimeout(timer)
      }
    } catch (e) {
      const sentHash = sends.bridgeHash()
      // Nothing bridged, or it provably never ran: safe to retry.
      if (!sentHash || !bridgeLeft) throw e
      // Out, and the wallet lost track of it: ask the bridge.
      originTxHash = sentHash
      lostSight = true
    }

    progress('registering')
    const status = await pollSquidNameStatus(provider, quote.route, originTxHash, opts.statusPoll)
    console.info('[names] polygon mana bridge status', { originTxHash, status })
    if (status === 'success') {
      clearInFlight(name)
      return { status: 'registered', originTxHash, destinationTxHash: null, manaWei: quote.manaWei }
    }
    if (status === 'refunded') {
      clearInFlight(name)
      throw new NameRefundedError()
    }
    if (status === 'partial_success' || status === 'failed_on_destination') {
      clearInFlight(name)
      throw new NameNotRegisteredError()
    }
    // Nothing here can say it will finish, so the buyer is not told it will.
    if (lostSight || ['unread', 'needs_gas', 'not_found'].includes(status)) throw new NameSettlementUnknownError()
    return { status: 'pending', originTxHash, manaWei: quote.manaWei }
  } catch (e) {
    console.error('[names] polygon mana register failed — raw error:', e, { name, buyer })
    // Nothing left the wallet under this attempt's mark, so it must not hold the NAME for anyone else.
    if (claimed && !bridgeLeft) clearInFlight(name)
    if (
      e instanceof NameQuoteMovedError ||
      e instanceof NameRouteUnavailableError ||
      e instanceof NameManaShortError ||
      e instanceof NameFeeShortError ||
      e instanceof NameTakenError ||
      e instanceof NameInFlightError ||
      e instanceof NameRefundedError ||
      e instanceof NameNotRegisteredError ||
      e instanceof NameSettlementUnknownError ||
      isWrongNetworkError(e)
    ) {
      throw e
    }
    const err = e as { code?: unknown; cancelled?: boolean; message?: string }
    const message = err.message ?? ''
    const typed: (Error & { cause?: unknown }) | null = /insufficient funds for account/i.test(message)
      ? new NameManaShortError()
      : err.code === 'INSUFFICIENT_FUNDS' || /insufficient funds/i.test(message)
        ? new NameFeeShortError()
        : null
    if (typed) {
      typed.cause = e
      throw typed
    }
    // A sped-up approval reads `cancelled=false`, which a "cancel" match would call a rejection.
    const replacedNotCancelled = err.code === 'TRANSACTION_REPLACED' && err.cancelled === false
    const fallback = t('names.errorGeneric')
    const failure: Error & { cause?: unknown } = new Error(replacedNotCancelled ? fallback : friendlyError(e, fallback))
    failure.cause = e
    throw failure
  }
}
