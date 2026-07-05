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
      // eslint-disable-next-line @typescript-eslint/naming-convention
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
  marketplaceServerUrl: env.VITE_MARKETPLACE_SERVER_URL ?? base.get('MARKETPLACE_SERVER_URL'),
  nftApiUrl: env.VITE_NFT_API_URL ?? base.get('NFT_API_URL'),
  chainId: Number(env.VITE_CHAIN_ID ?? base.get('CHAIN_ID')),
  authUrl: env.VITE_AUTH_URL ?? base.get('AUTH_URL'),
  rpcUrl: env.VITE_RPC_URL ?? base.get('RPC_URL'),
  creditsServerUrl: env.VITE_CREDITS_SERVER_URL ?? base.get('CREDITS_SERVER_URL'),
  builderServerUrl: env.VITE_BUILDER_SERVER_URL ?? base.get('BUILDER_SERVER_URL'),
  peerUrl: env.VITE_PEER_URL ?? base.get('PEER_URL'),
  shopServerUrl: env.VITE_SHOP_SERVER_URL ?? base.get('SHOP_SERVER_URL'),
  stripePublishableKey: env.VITE_STRIPE_PK ?? base.get('STRIPE_PUBLISHABLE_KEY'),
  segmentWriteKey: env.VITE_SEGMENT_WRITE_KEY ?? base.get('SEGMENT_WRITE_KEY')
}
