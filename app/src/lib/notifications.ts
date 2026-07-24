import signedFetch from 'decentraland-crypto-fetch'
import type { AuthIdentity } from '@dcl/crypto'
import type { DCLNotificationProps } from 'decentraland-ui2/dist/components/Notifications'
import { config } from '~/config'

// ---------------------------------------------------------------------------
// DCL push-notifications service client (address/identity-based, ADR-44 signed-fetch).
//
// The shop's per-env config JSONs don't (yet) carry a NOTIFICATIONS_SERVER_URL, so the host is derived
// from the committed Sentry environment tag — the one client-safe env signal already in config — with a
// VITE override for local stacks. This is the documented gap for full wiring: promote the URL to the
// config JSONs (see the PR notes). The service response shape is exactly ui2's DCLNotificationProps
// (`{ id, type, address, timestamp, read, created_at, updated_at, metadata }`), so no mapping is needed.
//
// Every call degrades gracefully: on any non-OK / network / auth error the fetch resolves to an empty
// list and mark-read resolves silently, so the navbar bell renders (empty) instead of throwing.
// ---------------------------------------------------------------------------

function notificationsBaseUrl(): string | null {
  const override = import.meta.env.VITE_NOTIFICATIONS_SERVER_URL
  if (override) return override.replace(/\/+$/, '')
  // 'development' | 'staging' | 'production' → prod hits .org, everything else the .zone stack.
  return config.sentryEnvironment === 'production'
    ? 'https://notifications.decentraland.org'
    : 'https://notifications.decentraland.zone'
}

// The connected user's notifications, newest first. Signed-fetch: the service authorizes the caller as
// the identity's address (address-based, no per-request address param needed).
export async function fetchNotifications(_address: string, identity: AuthIdentity): Promise<DCLNotificationProps[]> {
  const base = notificationsBaseUrl()
  if (!base) return []
  try {
    const res = await signedFetch(`${base}/notifications?limit=50`, { method: 'GET', identity, metadata: {} })
    if (!res.ok) return []
    const json = (await res.json()) as { notifications?: DCLNotificationProps[] }
    return json.notifications ?? []
  } catch {
    return []
  }
}

// Mark the given notification ids as read. Fire-and-forget from the caller's perspective; never throws.
export async function markNotificationsRead(identity: AuthIdentity, notificationIds: string[]): Promise<void> {
  const base = notificationsBaseUrl()
  if (!base || notificationIds.length === 0) return
  try {
    await signedFetch(`${base}/notifications/read`, {
      method: 'PUT',
      identity,
      metadata: {},
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notificationIds })
    })
  } catch {
    // Best-effort: the optimistic read flip already happened client-side; a failed sync just reconciles
    // on the next fetch.
  }
}
