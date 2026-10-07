// Kill switch for the Segment first party proxy. Ad blockers match Segment's own hosts, which is why the
// proxy exists; this is the way back to those hosts without a deploy, if the proxy itself ever misbehaves.
//
// The contract is shared with the other dapps (the marketplace keeps the same module next to its analytics
// saga): the `dapps-seg-alt` feature flag, and the localStorage key below. Kept as its own module, decoupled
// from `~/config` and from the provider, so it can move into `@dcl/hooks` once every dapp reads it the same
// way.

/**
 * Last known value of the `dapps-seg-alt` flag.
 *
 * The provider mounts at boot and the flag arrives over the network (see `lib/featureFlags`), so the boot
 * decides with what the previous page load learned and flipping the flag takes effect on the next one.
 * Persisted rather than awaited on purpose: blocking the provider on a flag fetch would delay — and an
 * outage would silently disable — every event on the page.
 */
export const SEGMENT_KILL_SWITCH_KEY = 'dcl-analytics-seg-alt'

/** The `AnalyticsProvider` props that route analytics.js and its events through our proxy. */
export type AnalyticsProxyProps = { cdnUrl?: string; apiHost?: string }

/**
 * The proxy props to mount `AnalyticsProvider` with, or `undefined` for "no proxy" — which is what leaves
 * analytics.js on Segment's own CDN and ingestion host.
 *
 * Spread into the element by the caller, so `undefined` has to mean the props are ABSENT: `@dcl/hooks` only
 * applies its Segment defaults when they are, and a present-but-empty value would point the SDK nowhere.
 *
 * A value that was never persisted counts as the switch being OFF: the flag service only publishes ENABLED
 * flags, so "absent" and "off" are indistinguishable, and a service that is down must never be able to
 * change where analytics goes.
 */
export function getAnalyticsProxyProps(cdnUrl?: string, apiHost?: string): AnalyticsProxyProps | undefined {
  if (isSegmentKillSwitchOn()) {
    return undefined
  }

  // The two halves are independent — one env could proxy the bundle and not the ingestion — so an empty
  // value drops just that prop instead of the whole object.
  const props = {
    ...(cdnUrl ? { cdnUrl } : undefined),
    ...(apiHost ? { apiHost } : undefined)
  }

  return Object.keys(props).length > 0 ? props : undefined
}

/** Records the flag so the next boot can read it synchronously, before anything can fetch it. */
export function persistSegmentKillSwitch(isEnabled: boolean): void {
  try {
    localStorage.setItem(SEGMENT_KILL_SWITCH_KEY, isEnabled ? '1' : '0')
  } catch {
    // Storage can be unavailable (private mode, quota). The route stays as this build was deployed with,
    // which is the safe end: events keep flowing, they just keep taking the same road.
  }
}

function isSegmentKillSwitchOn(): boolean {
  try {
    return localStorage.getItem(SEGMENT_KILL_SWITCH_KEY) === '1'
  } catch {
    return false
  }
}
