import { Env, createConfig } from '@dcl/ui-env'
import dev from './env/dev.json'
import stg from './env/stg.json'
import prod from './env/prod.json'

// Per-environment config, marketplace-style (@dcl/ui-env). ONE build artifact serves every env —
// the environment is chosen at RUNTIME from the hostname (decentraland.org → PRODUCTION,
// *.decentraland.zone → DEVELOPMENT/STAGING), with a `?env=` query override. For localhost (dev
// server + e2e) it falls back to VITE_DCL_DEFAULT_ENV ('dev'). The three JSONs are committed +
// reviewable; they hold only PUBLIC, client-safe values (hosts, chain id, DSN/keys that ship in the
// bundle anyway) — NEVER a real secret.
const base = createConfig(
  {
    [Env.DEVELOPMENT]: dev,
    [Env.STAGING]: stg,
    [Env.PRODUCTION]: prod
  },
  {
    systemEnvVariables: {
      VITE_DCL_DEFAULT_ENV: import.meta.env.VITE_DCL_DEFAULT_ENV ?? 'dev'
    }
  }
)

// Local-dev override layer: a `VITE_*` env var (from `.env.local`, or the e2e harness) wins over the
// per-env JSON, so a developer can point at a local backend stack without editing committed config.
// These are undefined in CI/deploys → the hostname-selected JSON is used. Vite bakes VITE_* into the
// client bundle, so never put secrets here.
const env = import.meta.env

export const config = {
  /**
   * Whether this is the production deployment, resolved from the hostname at runtime by @dcl/ui-env.
   *
   * Exposed so a behaviour that is production-only by nature does not have to be expressed as a feature-flag
   * hostname strategy. Those are evaluated against the REFERER, and the browser and the servers present
   * different ones — `core-stripe-payments` is currently ON in the prod flag file only for a `decentraland.zone`
   * referer, which means credits-server can never see it there. A runtime hostname check has no such trapdoor.
   */
  isProduction: base.is(Env.PRODUCTION),
  /**
   * Whether this is the staging deployment (`.today`), resolved the same way as `isProduction`.
   *
   * Staging is no longer a second copy of dev: it reads the production APIs, Polygon and the production
   * credits-server, so it is the launch rehearsal. Behaviour that exists only on public surfaces —
   * the pre-launch curtain — therefore has to apply here too, or the rehearsal is missing the thing
   * being rehearsed.
   */
  isStaging: base.is(Env.STAGING),
  /**
   * Arm the pre-launch curtain on the local dev server, so its behaviour can be exercised without a deploy:
   *
   *   VITE_SHOP_PRELAUNCH_LOCAL=true   in .env.local
   *
   * DEV BUILDS ONLY, and for the same reason as the feature-flag overrides: `import.meta.env.DEV` is
   * statically replaced with `false` in a production build, so this collapses to `false` and the whole
   * expression is dropped from the bundle rather than merely never taken. A query string or a stray env var
   * must not be able to put a holding page in front of the live Shop.
   */
  prelaunchLocalPreview: import.meta.env.DEV && env.VITE_SHOP_PRELAUNCH_LOCAL === 'true',
  marketplaceServerUrl: env.VITE_MARKETPLACE_SERVER_URL ?? base.get('MARKETPLACE_SERVER_URL'),
  chainId: Number(env.VITE_CHAIN_ID ?? base.get('CHAIN_ID')),
  authUrl: env.VITE_AUTH_URL ?? base.get('AUTH_URL'),
  rpcUrl: env.VITE_RPC_URL ?? base.get('RPC_URL'),
  /**
   * Ethereum L1 — the OTHER chain MANA lives on. The shop itself settles only on `chainId` (Polygon),
   * so these are read-only: they exist so a balance on L1 can be displayed without asking the wallet to
   * switch networks, exactly like `rpcUrl` does for Polygon.
   *
   * MANA is deployed on both chains at different addresses, so the RPC and the chainId must travel
   * together: resolving the contract for one chain and then querying it over the other chain's RPC
   * silently reads a non-MANA address and reports 0 rather than failing.
   */
  ethereumChainId: Number(env.VITE_ETHEREUM_CHAIN_ID ?? base.get('ETHEREUM_CHAIN_ID')),
  ethereumRpcUrl: env.VITE_ETHEREUM_RPC_URL ?? base.get('ETHEREUM_RPC_URL'),
  /**
   * Meta-transaction relayer (transactions-server shape; the POST target is `${relayerUrl}/transactions`).
   *
   * CHAIN-BOUND, which is why it sits next to rpcUrl: a relayer only submits on the chain it is configured
   * for, so it must move with CHAIN_ID. dev is Amoy via zone; stg and prod are both Polygon mainnet and
   * therefore both use the org relayer — stg is NOT a testnet here.
   *
   * It used to live in lib/gasless-config.ts, read straight off VITE_RELAYER_URL with a hard-coded fallback
   * to the zone (Amoy) relayer. No env JSON carried the key, so production silently relayed to zone and the
   * prod CSP blocked it: gasless never worked there, and every purchase fell through to a buyer-submitted
   * transaction. A default pointing at another environment does not fail, it works wrongly — so there is
   * deliberately no fallback here.
   */
  relayerUrl: env.VITE_RELAYER_URL ?? base.get('RELAYER_URL'),
  creditsServerUrl: env.VITE_CREDITS_SERVER_URL ?? base.get('CREDITS_SERVER_URL'),
  notificationsServerUrl: env.VITE_NOTIFICATIONS_SERVER_URL ?? base.get('NOTIFICATIONS_SERVER_URL'),
  builderServerUrl: env.VITE_BUILDER_SERVER_URL ?? base.get('BUILDER_SERVER_URL'),
  // Builder WEB app base (already includes the `/builder` path segment, marketplace-style) — used to
  // deep-link an owned NAME to its Builder management page (`${builderUrl}/names/<name>`).
  builderUrl: env.VITE_BUILDER_URL ?? base.get('BUILDER_URL'),
  peerUrl: env.VITE_PEER_URL ?? base.get('PEER_URL'),
  profileUrl: env.VITE_PROFILE_URL ?? base.get('PROFILE_URL'),
  shopServerUrl: env.VITE_SHOP_SERVER_URL ?? base.get('SHOP_SERVER_URL'),
  stripePublishableKey: env.VITE_STRIPE_PK ?? base.get('STRIPE_PUBLISHABLE_KEY'),
  segmentWriteKey: env.VITE_SEGMENT_WRITE_KEY ?? base.get('SEGMENT_WRITE_KEY'),
  // Sentry error monitoring. Empty DSN → monitoring no-ops (errors only hit the console). The DSN is a
  // public ingest key (ships in the bundle), NEVER a secret — it lives in the per-env JSONs like the
  // other client-safe values.
  sentryDsn: env.VITE_SENTRY_DSN ?? base.get('SENTRY_DSN'),
  // Per-env tag so dev/zone, staging and prod are distinguishable in Sentry. From each JSON's
  // ENVIRONMENT field ('development' | 'staging' | 'production') — NOT chainId, since dev+stg both
  // run on 80002 and would collapse into a single tag.
  sentryEnvironment: env.VITE_SENTRY_ENVIRONMENT ?? base.get('ENVIRONMENT'),
  // Release tag — MUST match the source-map upload's release, so Sentry can apply the maps and show a
  // readable stack. It now comes from the SAME const the vite plugin uploads under, injected at build
  // time (`define` in vite.config). It used to read VITE_APP_VERSION, which no build ever set: every
  // production event was stamped `shop@0.0.0-dev`, matched no uploaded map, and stayed minified.
  sentryRelease: __SENTRY_RELEASE__,
  // Decentraland feature-flag service. Per-env (dev/stg → .zone, prod → .org) rather than the hardcoded
  // `.org` the decentraland-dapps helper uses, because the point of a flag here is enabling on Amoy while
  // prod stays off. See lib/featureFlags.ts.
  // `String()` for the same reason as treasuryAddress below: @dcl/ui-env's `get` is untyped.
  featureFlagsUrl: String(env.VITE_FEATURE_FLAGS_URL ?? base.get('FEATURE_FLAGS_URL') ?? ''),
  // ORDERING, if this is ever enabled from scratch: credits-server's consumer must be live and armed FIRST.
  // With routing on here and the consumer off, listings route their MANA to the treasury and nobody credits
  // the seller — recoverable on a testnet, not on mainnet.
  // Checksum address that receives sale proceeds when the flag is ON — ops-provided per env. Empty when
  // the flag is OFF (never read in that case). The signing path guards on a non-empty value, so a
  // misconfigured ON flag can never route proceeds to an empty beneficiary.
  // dev/Amoy points at the real testnet treasury; stg/prod stay empty until the feature is signed off.
  //
  // The ADDRESS is all this file needs to contribute. Whether proceeds are actually routed is decided at
  // runtime by the `dapps-proceeds-to-treasury` feature flag, so the flow can be started and stopped without
  // a deploy — and an empty address here makes routing impossible regardless of that flag, which is what
  // keeps stg/prod safe.
  treasuryAddress: String(env.VITE_TREASURY_ADDRESS ?? base.get('TREASURY_ADDRESS') ?? '')
}
