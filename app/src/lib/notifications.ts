import signedFetch from 'decentraland-crypto-fetch'
import type { AuthIdentity } from '@dcl/crypto'
import type { DCLNotificationProps } from 'decentraland-ui2/dist/components/Notifications'
import { config } from '~/config'

// ---------------------------------------------------------------------------
// DCL push-notifications service client (address/identity-based, ADR-44 signed-fetch).
//
// Host comes from the per-env config (NOTIFICATIONS_SERVER_URL — notifications.decentraland.zone on
// dev/stg, .org on prod), the same service the marketplace uses; a VITE_NOTIFICATIONS_SERVER_URL
// override (handled in config) points at a local stack. The service response shape is exactly ui2's
// DCLNotificationProps (`{ id, type, address, timestamp, read, created_at, updated_at, metadata }`),
// so no mapping is needed.
//
// Every call degrades gracefully: on any non-OK / network / auth error the fetch resolves to an empty
// list and mark-read resolves silently, so the navbar bell renders (empty) instead of throwing.
// ---------------------------------------------------------------------------

function notificationsBaseUrl(): string | null {
  const base = config.notificationsServerUrl
  return base ? base.replace(/\/+$/, '') : null
}

// Coerce a notification date field to a valid epoch-ms number, or null if it can't be. Accepts ms/sec
// numbers (values below ~1e12 are treated as seconds), numeric strings, and ISO/date strings.
function toMillis(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const ms = value < 1e12 ? value * 1000 : value
    return Number.isNaN(new Date(ms).getTime()) ? null : ms
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const asNum = Number(value)
    if (Number.isFinite(asNum)) return toMillis(asNum)
    const parsed = Date.parse(value)
    return Number.isNaN(parsed) ? null : parsed
  }
  return null
}

// The connected user's notifications, newest first. Signed-fetch: the service authorizes the caller as
// the identity's address (address-based, no per-request address param needed).
export async function fetchNotifications(_address: string, identity: AuthIdentity): Promise<DCLNotificationProps[]> {
  const base = notificationsBaseUrl()
  if (!base) return []
  try {
    const res = await signedFetch(`${base}/notifications?limit=50`, { method: 'GET', identity, metadata: {} })
    if (!res.ok) {
      void res.body?.cancel()
      return []
    }
    const json = (await res.json()) as { notifications?: DCLNotificationProps[] }
    // ui2's Notifications renders each item's `timestamp` via formatDistanceToNow; a missing/unparseable
    // value throws "Invalid time value" and crashes the whole panel. Normalize the timestamp (seconds →
    // ms, numeric strings, ISO strings) and DROP any item we can't resolve to a valid date, so the panel
    // only ever gets renderable items.
    return (json.notifications ?? []).flatMap(n => {
      const ts =
        toMillis((n as { timestamp?: unknown }).timestamp) ?? toMillis((n as { created_at?: unknown }).created_at)
      return ts === null ? [] : [{ ...n, timestamp: ts }]
    })
  } catch {
    return []
  }
}

// Mark the given notification ids as read. Fire-and-forget from the caller's perspective; never throws.
export async function markNotificationsRead(identity: AuthIdentity, notificationIds: string[]): Promise<void> {
  const base = notificationsBaseUrl()
  if (!base || notificationIds.length === 0) return
  try {
    const res = await signedFetch(`${base}/notifications/read`, {
      method: 'PUT',
      identity,
      metadata: {},
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notificationIds })
    })
    void res.body?.cancel()
  } catch {
    // Best-effort: the optimistic read flip already happened client-side; a failed sync just reconciles
    // on the next fetch.
  }
}
