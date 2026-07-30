import { config } from '~/config'

/**
 * Decentraland feature flags, read from the same service every other dapp reads.
 *
 * The marketplace consumes these through `decentraland-dapps`' redux module (`features/utils.ts` fetches
 * `${host}/${app}.json` and a saga polls it). The shop has no redux, so this is the same SOURCE and the same
 * key convention (`${app}-${feature}`, e.g. `dapps-proceeds-to-treasury`) reached without pulling in a store:
 * a cached fetch behind an async accessor, plus a react-query hook for anything that renders.
 *
 * The host is per-environment (dev/stg → `.zone`, prod → `.org`) rather than hardcoded the way the
 * dapps helper does it, because the whole point of a flag here is to enable on Amoy while prod stays off.
 */

/** Flag names as they appear in the service, WITHOUT the `${app}-` prefix. */
export enum FeatureFlag {
  /**
   * Shop "proceeds to treasury": a sale's proceeds are routed to the treasury and the seller is credited in
   * closed-loop shop credits instead of receiving MANA.
   *
   * The RUNTIME kill switch for the producer half of that flow, and the one that has to work fastest: while
   * the shop keeps signing listings that name the treasury, MANA accumulates there against sellers who
   * cannot be paid if the consumer is down. Turning this off makes new listings pay their seller directly
   * again (today's behaviour) and lets the consumer drain whatever is already in flight.
   */
  PROCEEDS_TO_TREASURY = 'proceeds-to-treasury',

  /**
   * Whether the Shop offers SECONDARY sales (resales) at all — buying a listed token, and putting an owned
   * one up for sale.
   *
   * OFF by default, and off in every environment. Product decision: the Shop does not intermediate resales.
   *
   * Primary sales are untouched — creators list from their collections and are paid in MANA directly.
   *
   * This hides the Shop's surfaces; it does NOT retract listings that already exist on-chain. Those stay
   * valid and fillable through the legacy Marketplace. Making them stop existing is a per-listing signature
   * cancellation, not a flag.
   */
  SECONDARY_SALES = 'shop-secondary-sales'
}

/** The application whose flag file carries the flags above. */
const APPLICATION = 'dapps'

/**
 * How long a fetched snapshot is trusted. The value is only consulted when it matters (a render, or the
 * moment a listing is signed), so there is no background poller — a stale-past-TTL read simply refetches.
 * The practical effect is that flipping the flag takes at most this long to reach a page that is already
 * open, with zero idle traffic.
 */
const TTL_MS = 60_000

/** Bounded so a hung flag service cannot hang a signature dialog behind it. */
const TIMEOUT_MS = 3_000

type Snapshot = { flags: Record<string, boolean>; fetchedAt: number }

let snapshot: Snapshot | undefined
let inFlight: Promise<Snapshot> | undefined

function flagKey(flag: FeatureFlag): string {
  return `${APPLICATION}-${flag}`
}

async function fetchSnapshot(): Promise<Snapshot> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetch(`${config.featureFlagsUrl}/${APPLICATION}.json`, {
      signal: controller.signal
    })
    if (!response.ok) {
      throw new Error(`feature flags request failed with ${response.status}`)
    }
    const body = (await response.json()) as { flags?: Record<string, boolean> }
    return { flags: body.flags ?? {}, fetchedAt: Date.now() }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Returns the current flags, from cache when fresh. Concurrent callers share one request.
 *
 * A failed fetch is deliberately NOT cached: flags are consulted rarely (a modal opening, a listing being
 * signed), so retrying next time costs nothing and caching a failure would extend an outage past its end.
 */
export async function getFeatureFlags(): Promise<Record<string, boolean>> {
  if (snapshot && Date.now() - snapshot.fetchedAt < TTL_MS) {
    return snapshot.flags
  }
  if (!inFlight) {
    inFlight = fetchSnapshot()
      .then(fresh => {
        snapshot = fresh
        return fresh
      })
      .finally(() => {
        inFlight = undefined
      })
  }
  return (await inFlight).flags
}

/**
 * Whether a flag is on. FAILS CLOSED — an unreachable flag service, a malformed body or an absent flag all
 * resolve to `false`.
 *
 * For {@link FeatureFlag.PROCEEDS_TO_TREASURY} that is the safe direction by a wide margin: `false` means a
 * listing pays its seller directly in MANA, which is exactly what the shop did before this feature existed.
 * The dangerous direction would be routing proceeds to the treasury while unsure whether anything is able
 * to credit the seller for them.
 */
export async function getIsFeatureEnabled(flag: FeatureFlag): Promise<boolean> {
  const override = devOverrideFor(flag)
  if (override !== undefined) return override
  try {
    const flags = await getFeatureFlags()
    return flags[flagKey(flag)] === true
  } catch {
    return false
  }
}

/**
 * Local development override, read from VITE_FEATURE_FLAG_OVERRIDES in .env.local:
 *
 *   VITE_FEATURE_FLAG_OVERRIDES=shop-secondary-sales:true,shop-flash-sales:false
 *
 * Why this exists: a flag-gated flow is otherwise untestable locally. `shop-secondary-sales` is absent from
 * the dapps flag file, so it reads false, so the whole resale path — the migrate banner on My Assets, the
 * `owned` section of /import, the Sell action on a held token — cannot be exercised at all before it ships.
 *
 * DEV BUILDS ONLY. Gated on `import.meta.env.DEV`, which Vite statically replaces with `false` in a
 * production build, so this branch and the parsing below are dropped from the bundle entirely rather than
 * merely never taken. A feature flag that a query string or a stray env var could flip in production would
 * be worse than no override at all.
 */
function devOverrideFor(flag: FeatureFlag): boolean | undefined {
  if (!import.meta.env.DEV) return undefined
  const raw: unknown = import.meta.env.VITE_FEATURE_FLAG_OVERRIDES
  if (typeof raw !== 'string' || raw.length === 0) return undefined

  for (const entry of raw.split(',')) {
    const [name, value] = entry.split(':').map(part => part.trim())
    // Matched against the BARE flag name (`shop-secondary-sales`), not the `dapps-` prefixed key, because the
    // bare name is what the FeatureFlag enum and the dashboard both use.
    if (name !== (flag as string)) continue
    if (value === 'true') return true
    if (value === 'false') return false
    // A typo'd value falls through to the real flag rather than being read as false: silently forcing a flag
    // off because someone wrote `:ture` is the kind of local-only surprise that costs an afternoon.
    console.warn(`Ignoring feature flag override "${entry}": value must be exactly "true" or "false"`)
  }
  return undefined
}

/** Test seam: drops the cached snapshot so a spec starts from a known state. */
export function resetFeatureFlagsCache(): void {
  snapshot = undefined
  inFlight = undefined
}

/**
 * Whether this build routes sale proceeds to the treasury.
 *
 * The runtime flag is the ONLY switch. There is deliberately no second build-time boolean: on this side the
 * decision is just which beneficiary to sign into a listing, so a config flag would add nothing except a
 * deploy between deciding to stop and stopping. (credits-server keeps an env var alongside its flag for a
 * reason that does not apply here — there, it decides at BOOT whether the `dapps` connection and the
 * proceeds components exist at all, which no runtime flag can retrofit.)
 *
 * A configured treasury address is still required, and that is what keeps stg/prod safe: they ship with it
 * empty, so routing is impossible there however the flag is set.
 */
export async function getIsProceedsToTreasuryEnabled(): Promise<boolean> {
  if (!config.treasuryAddress) {
    return false
  }
  return getIsFeatureEnabled(FeatureFlag.PROCEEDS_TO_TREASURY)
}

/**
 * Whether the Shop offers secondary sales.
 *
 * Fails CLOSED like every other accessor here, and here that is the direction the product wants anyway: an
 * unreachable flag service hides resales rather than offering a flow the Shop is not meant to have.
 */
export async function getIsSecondarySalesEnabled(): Promise<boolean> {
  return getIsFeatureEnabled(FeatureFlag.SECONDARY_SALES)
}
