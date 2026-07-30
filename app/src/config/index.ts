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
  marketplaceServerUrl: env.VITE_MARKETPLACE_SERVER_URL ?? base.get('MARKETPLACE_SERVER_URL'),
  chainId: Number(env.VITE_CHAIN_ID ?? base.get('CHAIN_ID')),
  authUrl: env.VITE_AUTH_URL ?? base.get('AUTH_URL'),
  rpcUrl: env.VITE_RPC_URL ?? base.get('RPC_URL'),
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
  // Release tag — MUST match the source-map upload's release (vite plugin / CI). e.g. "shop@1.2.3".
  sentryRelease: env.VITE_SENTRY_RELEASE ?? `shop@${env.VITE_APP_VERSION ?? '0.0.0-dev'}`,
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
