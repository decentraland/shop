// ---------------------------------------------------------------------------
// payments-stripe.ts — the REAL (Stripe-backed) "get credits" money path.
//
// The MOCK path lives in payments.ts (mockCreatePackCheckout / mockPollCreditGrant) and
// stays fully working for offline demos. This module is the real seam: signed-fetch to the
// credits-server checkout + order endpoints, mounted by the app when Stripe is enabled.
//
// Why credits-server (not shop-server)? The endpoints sit next to the USD ledger
// (createUsdTopUp) and the existing signed-fetch auth + IAP-webhook precedent. shop-server
// is the treasury (USDC leg), which is decoupled and never on the buy path. See
// shop/design/STRIPE_SPEC.md.
//
// The buyer never sees anything but "$" and "credits"; none of Stripe/card/USDC leaks here.
//
// ===== BACKEND CONTRACT (credits-server) =====================================
//   POST /credits/checkout            (signed-fetch, ADR-44: caller == buyer)
//     req : { packId: string, timezone?: string, source: 'website' }
//     res : { orderId: string, url: string }   // Stripe HOSTED Checkout Session URL
//           The app redirects the browser to `url`; Stripe returns to
//           `${STRIPE_RETURN_URL}?order=${orderId}` (or `...&canceled=1`).
//
//   GET  /credits/orders/:orderId     (signed-fetch)
//     res : { status: CreditOrderStatus, creditsGranted?, newBalance?, error? }
//           The full list lives in lib/credits (initiated | processing | crediting | credited | failed |
//           abandoned) and OrderStatus derives from it — never restate it here.
// ===========================================================================

import signedFetch from 'decentraland-crypto-fetch'
import type { AuthIdentity } from '@dcl/crypto'
import { config } from '~/config'
import type { CheckoutSession, OrderStatus } from '~/lib/payments'

// The /credits/* endpoints (checkout + order status) live on the credits-server, next to the
// USD ledger and its signed-fetch auth. shop-server is the treasury (USDC leg) and is never on
// the buy path, so it must NOT be used here (G1).
function paymentsBaseUrl(): string {
  return config.creditsServerUrl
}

/**
 * The buyer's IANA zone, sent with the checkout so abandonment can be read by region.
 *
 * It travels on THIS request rather than as an analytics event on purpose: a third of the wallets that
 * start a checkout emit no analytics at all (ad/privacy extensions), and those are exactly the buyers whose
 * abandonment we cannot currently explain. A signed request the app already makes cannot be blocked
 * selectively.
 *
 * A zone, not an IP or a location: coarse enough to be a region hint, and it identifies nobody. The server
 * validates the shape and drops anything odd, so this stays best-effort — `undefined` when the runtime has
 * no zone, which keeps the field out of the body entirely rather than sending a null.
 *
 * `|| undefined` is unreachable on a compliant engine (ECMA-402 §11.1.2: `timeZone` is a non-empty string
 * whenever the constructor succeeded, and it throws otherwise). It is kept for the ones that are not — old
 * WebViews built without full ICU data have returned an empty string here, and the app runs inside the
 * in-world client's browser as well as a desktop one. It is load-bearing given the caller relies on
 * `undefined` to drop the key: an empty string would serialise as `"timezone":""`.
 */
function buyerTimezone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined
  } catch {
    return undefined
  }
}

/**
 * Real checkout: POST /credits/checkout via signed-fetch so the server binds the order to
 * the authenticated buyer. Returns the Stripe HOSTED Checkout URL the app redirects to.
 */
export async function createPackCheckoutReal(packId: string, identity: AuthIdentity): Promise<CheckoutSession> {
  const res = await signedFetch(`${paymentsBaseUrl()}/credits/checkout`, {
    method: 'POST',
    identity,
    metadata: {},
    headers: { 'Content-Type': 'application/json' },
    // `source` declares the surface, matching what the buy path already sends to /credits/authorize:
    // the Explorer creates checkouts through this same endpoint, so without it every credit purchase
    // looks alike and "how much revenue comes from in-world" has no answer.
    // JSON.stringify drops an undefined value, so an absent zone leaves the body as `{ packId, source }`.
    body: JSON.stringify({ packId, timezone: buyerTimezone(), source: 'website' })
  })
  if (!res.ok) throw new Error(`checkout ${res.status}: ${await res.text()}`)
  const { orderId, url } = (await res.json()) as { orderId: string; url: string }
  return { orderId, url, mock: false }
}

/**
 * Real credit-grant poll: GET /credits/orders/:orderId via signed-fetch until the order
 * flips off 'processing' (the verified webhook wrote the USD top-up). On return the caller
 * should invalidate the ['usd-balance'] query so the header balance refreshes.
 */
export async function pollCreditGrantReal(
  orderId: string,
  identity: AuthIdentity,
  opts: { intervalMs?: number; timeoutMs?: number; signal?: AbortSignal } = {}
): Promise<OrderStatus> {
  const { intervalMs = 1500, timeoutMs = 60_000, signal } = opts
  const deadline = Date.now() + timeoutMs

  while (true) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    const status = await fetchOrderStatusReal(orderId, identity, signal)
    if (!stillWaiting(status.status)) return status
    if (Date.now() > deadline) {
      // Still 'initiated' when we stop: no payment was ever reported, so there is nothing on its way.
      // Returning 'pending' here would promise credits to somebody who has not been charged — the very
      // thing the server split 'initiated' out of 'processing' to stop us saying.
      if (status.status === 'initiated') return status
      // Not a failure: the payment may still settle via the verified webhook after we stop polling.
      // Surface a 'pending' so the UI shows an "on the way" state instead of an error (U7).
      return { status: 'pending' }
    }
    await delay(intervalMs, signal)
  }
}

/**
 * Statuses the poll keeps waiting on.
 *
 * 'processing' and 'crediting' are both "the money arrived, the credits are not in the balance yet".
 * 'initiated' is nobody has paid — it waits here only because the Stripe return can beat the webhook that
 * moves the order off it, so giving up on the first read would tell a buyer who DID pay that they had not.
 * Ending on it is a different question, answered at the deadline above.
 */
function stillWaiting(status: OrderStatus['status']): boolean {
  return status === 'processing' || status === 'crediting' || status === 'initiated'
}

async function fetchOrderStatusReal(
  orderId: string,
  identity: AuthIdentity,
  signal?: AbortSignal
): Promise<OrderStatus> {
  const res = await signedFetch(`${paymentsBaseUrl()}/credits/orders/${orderId}`, {
    method: 'GET',
    identity,
    metadata: {},
    signal
  })
  // A 404 right after the Stripe return is transient, NOT a failure: the order row is created before
  // the redirect, but on the return callback it can be briefly invisible to this read (read-replica
  // lag) or the signed-fetch caller identity isn't fully restored yet (server returns the same 404 for
  // "not found" and "not yours"). Treat it as still-processing so the poll keeps trying; if it never
  // resolves within the window, pollCreditGrantReal returns 'pending' ("on the way") — the verified
  // webhook is the source of truth and still grants the credits. Never a hard error on a paid order.
  if (res.status === 404) return { status: 'processing' }
  if (!res.ok) throw new Error(`order status ${res.status}`)
  return res.json() as Promise<OrderStatus>
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(t)
      reject(new DOMException('Aborted', 'AbortError'))
    })
  })
}
