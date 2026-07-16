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
//     req : { packId: string }
//     res : { orderId: string, clientSecret: string }   // Stripe embedded client_secret
//
//   GET  /credits/orders/:orderId     (signed-fetch)
//     res : { status: 'processing' | 'credited' | 'failed',
//             creditsGranted?, newBalance?, error? }
// ===========================================================================

import signedFetch from 'decentraland-crypto-fetch'
import type { AuthIdentity } from '@dcl/crypto'
import { config } from '~/config'
import type { CheckoutSession, OrderStatus } from '~/lib/payments'

// The real endpoints live on the credits-server (same host as the USD balance).
function paymentsBaseUrl(): string {
  // Prefer an explicit shop-server url if one is ever wired for payments; default to the
  // credits-server, which is where the Stripe endpoints are implemented.
  return config.shopServerUrl || config.creditsServerUrl
}

/**
 * Real checkout: POST /credits/checkout via signed-fetch so the server binds the order to
 * the authenticated buyer. Returns the Stripe embedded client secret the app mounts.
 */
export async function createPackCheckoutReal(
  packId: string,
  identity: AuthIdentity
): Promise<CheckoutSession> {
  const res = await signedFetch(`${paymentsBaseUrl()}/credits/checkout`, {
    method: 'POST',
    identity,
    metadata: {},
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ packId })
  })
  if (!res.ok) throw new Error(`checkout ${res.status}: ${await res.text()}`)
  const { orderId, clientSecret } = (await res.json()) as { orderId: string; clientSecret: string }
  return { orderId, clientSecret, mock: false }
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

  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    const status = await fetchOrderStatusReal(orderId, identity, signal)
    if (status.status !== 'processing') return status
    if (Date.now() > deadline) {
      // Not a failure: the payment may still settle via the verified webhook after we stop polling.
      // Surface a 'pending' so the UI shows an "on the way" state instead of an error (U7).
      return { status: 'pending' }
    }
    await delay(intervalMs, signal)
  }
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
  if (!res.ok) throw new Error(`order status ${res.status}`)
  return res.json()
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
