// ---------------------------------------------------------------------------
// payments.ts — the "get credits" money path (buy a credit pack with a card).
//
// Credits are sold as FIXED USD: 1 credit = $0.10 (see VISION.md / shop-server plan).
// The buyer never sees anything but "$" and "credits". Underneath, the card charge
// is settled by Stripe and the backing lands as dollars in our treasury; once that
// clears the buyer's credit balance goes up. NONE of that plumbing is exposed here.
//
// This module is a thin abstraction over the backend so the UI can be built and
// demoed today while the real shop-server endpoints are finalised in parallel.
//
// ===== REAL BACKEND CONTRACT (shop-server — NOT built here) ===================
// The UI talks to two endpoints. See STRIPE_SPEC.md for the full spec + webhook side.
//
//   POST /credits/checkout                (signed-fetch, ADR-44: caller == buyer)
//     req : { packId: string }
//     res : { orderId: string, clientSecret: string }
//           `clientSecret` is a Stripe *embedded Checkout* client secret
//           (session.client_secret from checkout.sessions.create with
//            ui_mode:'embedded'). The UI mounts it with <EmbeddedCheckout/>.
//           The pack -> price/credits mapping is authoritative on the SERVER;
//           the client only sends packId (never a price) to avoid tampering.
//
//   GET  /credits/orders/:orderId         (signed-fetch)
//     res : { status: 'processing' | 'credited' | 'failed',
//             creditsGranted?: number, newBalance?: number, error?: string }
//           The UI polls this after Stripe reports payment success. The order
//           flips to 'credited' only once the Stripe webhook
//           (checkout.session.completed) has been verified server-side AND the
//           credit grant has been written to the ledger. This is the "payment
//           succeeded, crediting…" window.
//
// The credit-granting endpoint itself lives in credits-server and its denomination
// (USD vs MANA) is being decided in parallel — shop-server owns the webhook, verifies
// it, and calls into credits-server. The UI only ever sees the two endpoints above.
// ===========================================================================

import type { AuthIdentity } from '@dcl/crypto'
import { config } from '~/config'
import { devMintUsd } from '~/lib/credits'
import { createPackCheckoutReal, pollCreditGrantReal } from '~/lib/payments-stripe'

// 1 credit = $0.10.
export const USD_PER_CREDIT = 0.1

export type CreditPack = {
  id: string
  usd: number
  credits: number
  /** The single highlighted "best value" pack. */
  bestValue?: boolean
}

// Pack catalogue. Kept here so the UI + tests share one source of truth; the real
// server mirrors these ids (client sends only the id, server owns the amounts).
export const CREDIT_PACKS: CreditPack[] = [
  { id: 'pack_5', usd: 5, credits: creditsForUsd(5) },
  { id: 'pack_10', usd: 10, credits: creditsForUsd(10) },
  { id: 'pack_25', usd: 25, credits: creditsForUsd(25), bestValue: true },
  { id: 'pack_50', usd: 50, credits: creditsForUsd(50) }
]

/** Credits granted for a given USD amount at the fixed peg. */
export function creditsForUsd(usd: number): number {
  return Math.round(usd / USD_PER_CREDIT)
}

/** USD price for a given number of credits at the fixed peg. */
export function usdForCredits(credits: number): number {
  return Math.round(credits * USD_PER_CREDIT * 100) / 100
}

export function getPack(packId: string): CreditPack | undefined {
  return CREDIT_PACKS.find(p => p.id === packId)
}

export type CheckoutSession = {
  orderId: string
  /** Stripe embedded-Checkout client secret, or a mock sentinel in dev. */
  clientSecret: string
  /** True when this came from the local mock (no real Stripe backend wired). */
  mock: boolean
}

export type OrderStatus = {
  status: 'processing' | 'credited' | 'failed'
  creditsGranted?: number
  newBalance?: number
  error?: string
}

// Sentinel prefix so the UI can tell a mock session from a real one and render a
// simulated card form instead of the real Stripe widget.
export const MOCK_CLIENT_SECRET_PREFIX = 'mock_cs_'

/** Are we running against the mock (no real Stripe) ? */
export function isMockPayments(): boolean {
  // Real mode needs the Stripe publishable key. The checkout/webhook endpoints live on the
  // credits-server (always configured — see payments-stripe paymentsBaseUrl() + STRIPE_SPEC §1), so
  // the key is the only client-side switch; the server independently gates on STRIPE_ENABLED.
  return !config.stripePublishableKey
}

// ---------------------------------------------------------------------------
// createPackCheckout — start a purchase.
//   REAL: POST /credits/checkout on shop-server (signed-fetch), returns a Stripe
//         embedded client secret the UI mounts.
//   MOCK: returns a fake client secret so the whole flow is demoable offline.
// ---------------------------------------------------------------------------
export async function createPackCheckout(
  packId: string,
  auth?: { address: string; identity: unknown }
): Promise<CheckoutSession> {
  const pack = getPack(packId)
  if (!pack) throw new Error('Unknown pack')

  if (isMockPayments()) {
    return mockCreatePackCheckout(pack)
  }

  // Real path: signed-fetch to the credits-server checkout so the order binds to the buyer.
  if (!auth?.identity) throw new Error('Sign in to get credits.')
  return createPackCheckoutReal(packId, auth.identity as AuthIdentity)
}

// ---------------------------------------------------------------------------
// pollCreditGrant — after Stripe reports the card charge succeeded, wait for the
// backend to verify the webhook and write the credits to the ledger.
//   REAL: GET /credits/orders/:orderId until status != 'processing'.
//   MOCK: resolves 'credited' after a short delay.
// ---------------------------------------------------------------------------
export async function pollCreditGrant(
  orderId: string,
  opts: { intervalMs?: number; timeoutMs?: number; signal?: AbortSignal; address?: string; identity?: AuthIdentity } = {}
): Promise<OrderStatus> {
  const { intervalMs, timeoutMs, signal, identity } = opts

  if (orderId.startsWith(MOCK_CLIENT_SECRET_PREFIX) || isMockPayments()) {
    return mockPollCreditGrant(orderId, opts)
  }

  // Real path: signed-fetch poll of the order status until the verified webhook grants the credits.
  if (!identity) throw new Error('Sign in to get credits.')
  return pollCreditGrantReal(orderId, identity, { intervalMs, timeoutMs, signal })
}

// ---------------------------------------------------------------------------
// Mock implementations (dev / demo — no real Stripe backend needed).
// ---------------------------------------------------------------------------
function mockCreatePackCheckout(pack: CreditPack): Promise<CheckoutSession> {
  const orderId = `${MOCK_CLIENT_SECRET_PREFIX}${pack.id}_${Date.now()}`
  return delay(400).then(() => ({
    orderId,
    clientSecret: `${MOCK_CLIENT_SECRET_PREFIX}${pack.id}`,
    mock: true
  }))
}

async function mockPollCreditGrant(
  orderId: string,
  opts: { intervalMs?: number; address?: string } = {}
): Promise<OrderStatus> {
  // Simulate the brief "crediting…" window after a successful charge.
  await delay(opts.intervalMs ?? 900)
  const packId = orderId.replace(MOCK_CLIENT_SECRET_PREFIX, '').replace(/_\d+$/, '')
  const pack = getPack(packId)
  const creditsGranted = pack?.credits ?? 0
  // LOCAL DEV: actually top up the real credits-server balance via /dev/mint-usd so the whole app
  // reflects the purchase (the mock stands in for Stripe→treasury→credit-grant). If no address is
  // provided (e.g. unit tests), stay a pure mock.
  if (opts.address && pack) {
    try {
      const res = await devMintUsd(opts.address, Math.round(pack.usd * 100))
      return { status: 'credited', creditsGranted, newBalance: res.credits }
    } catch (e) {
      return { status: 'failed', error: (e as Error).message }
    }
  }
  return { status: 'credited', creditsGranted, newBalance: creditsGranted }
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
