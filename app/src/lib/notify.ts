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
// Base URL: config.shopServerUrl when set. It's empty until the shop-server host is wired into the
// env JSONs (src/config/env/*.json), so we fall back to the current origin — that keeps signedFetch's
// `new URL()` happy (it rejects a bare relative path) and simply resolves to "not subscribed" until
// the real host lands.
function notifyBase(): string {
  return config.shopServerUrl || (typeof window !== 'undefined' ? window.location.origin : '')
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
  const qs = new URLSearchParams({ contractAddress, itemId })
  const url = `${notifyBase()}/notify-requests?${qs.toString()}`
  const res = await signedFetch(url, { method: 'GET', identity, metadata: {} })
  if (!res.ok) throw new Error(`getNotifyRequest ${res.status}`)
  return res.json() as Promise<NotifyStatus>
}

// Subscribe this account to a "back in stock / now for sale" notification for the item.
export async function createNotifyRequest(req: NotifyRequest, identity: AuthIdentity): Promise<void> {
  const url = `${notifyBase()}/notify-requests`
  const res = await signedFetch(url, {
    method: 'POST',
    identity,
    metadata: {},
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req)
  })
  if (!res.ok) throw new Error(`createNotifyRequest ${res.status}: ${await res.text()}`)
}
