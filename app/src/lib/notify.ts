import signedFetch from 'decentraland-crypto-fetch'
import type { AuthIdentity } from '@dcl/crypto'
import { config } from '~/config'

// "Notify me when available" requests for a not-for-sale item, served by shop-server. Both endpoints
// are ADR-44 signed-fetch: the requester's account is derived from the signed request (never sent in
// the body), same as the credits-server calls (see lib/credits.ts). shop-server is built in parallel;
// the endpoint contract this file calls is the source of truth the backend must match:
//   POST /notify-requests  body { contractAddress, itemId, chainId, email } → 201 { ok: true }
//   GET  /notify-requests?contractAddress=&itemId=            → { subscribed, email? }
//
// Base URL: config.shopServerUrl, which is still empty in every env JSON (src/config/env/*.json) until
// the shop-server host is wired up. This used to fall back to the app's own origin on the assumption
// that a missing endpoint reads as "not subscribed" — but the SPA host answers ANY unknown path with
// 200 + the index.html shell, so the subscribe POST looked like it succeeded while nothing was stored,
// and the status GET could never report a subscription. No host configured = feature unavailable.
function notifyBase(): string | null {
  return config.shopServerUrl || null
}

/** Whether a shop-server host is configured, i.e. a subscription can actually be stored. */
export function isNotifyAvailable(): boolean {
  return !!notifyBase()
}

export type NotifyStatus = { subscribed: boolean; email?: string }

export type NotifyRequest = {
  contractAddress: string
  itemId: string
  chainId: number
  email: string
}

// Whether this account already asked to be notified for (contractAddress, itemId), plus the email we
// have on file (used to prefill the input in the already-subscribed state).
export async function getNotifyRequest(
  contractAddress: string,
  itemId: string,
  identity: AuthIdentity
): Promise<NotifyStatus> {
  const base = notifyBase()
  if (!base) return { subscribed: false }
  const qs = new URLSearchParams({ contractAddress, itemId })
  const url = `${base}/notify-requests?${qs.toString()}`
  const res = await signedFetch(url, { method: 'GET', identity, metadata: {} })
  if (!res.ok) throw new Error(`getNotifyRequest ${res.status}`)
  return json<NotifyStatus>(res, 'getNotifyRequest')
}

// Subscribe this account to a "back in stock / now for sale" notification for the item.
export async function createNotifyRequest(req: NotifyRequest, identity: AuthIdentity): Promise<void> {
  const base = notifyBase()
  if (!base) throw new Error('createNotifyRequest: no shop-server host configured')
  const url = `${base}/notify-requests`
  const res = await signedFetch(url, {
    method: 'POST',
    identity,
    metadata: {},
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req)
  })
  if (!res.ok) throw new Error(`createNotifyRequest ${res.status}: ${await res.text()}`)
  // Also drains the success body so the underlying connection isn't left open.
  await json(res, 'createNotifyRequest')
}

// A 200 carrying HTML is a host answering for a route it doesn't implement, not a stored subscription —
// treat it as the failure it is instead of reporting success to the buyer.
async function json<T>(res: { json: () => Promise<unknown> }, label: string): Promise<T> {
  try {
    return (await res.json()) as T
  } catch {
    throw new Error(`${label}: response was not JSON`)
  }
}
