/// <reference types="vite/client" />

// Type the `VITE_*` vars the app reads from `import.meta.env`. Without this augmentation Vite's
// default `[key: string]: any` fallback makes every `env.VITE_*` access `any`, which cascades into
// no-unsafe-* lint errors wherever a config value flows into a typed API (e.g. ethers). All VITE_*
// values arrive as strings (or undefined when unset), so callers coerce as needed (Number(...), ??).
interface ImportMetaEnv {
  readonly VITE_APP_VERSION?: string
  readonly VITE_AUTH_URL?: string
  readonly VITE_BUILDER_SERVER_URL?: string
  readonly VITE_BUILDER_URL?: string
  readonly VITE_CHAIN_ID?: string
  readonly VITE_CREDITS_SERVER_URL?: string
  readonly VITE_DCL_DEFAULT_ENV?: string
  readonly VITE_GASLESS_CHECKOUT?: string
  readonly VITE_MARKETPLACE_SERVER_URL?: string
  readonly VITE_PEER_URL?: string
  readonly VITE_PROFILE_URL?: string
  readonly VITE_RELAYER_URL?: string
  readonly VITE_RPC_URL?: string
  readonly VITE_SEGMENT_WRITE_KEY?: string
  readonly VITE_SENTRY_DSN?: string
  readonly VITE_SENTRY_ENVIRONMENT?: string
  readonly VITE_SENTRY_RELEASE?: string
  readonly VITE_SHOP_SERVER_URL?: string
  readonly VITE_STRIPE_PK?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
