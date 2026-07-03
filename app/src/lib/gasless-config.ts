// Gasless-checkout feature flag + relayer config.
//
// NEW file. Does NOT touch src/config.ts (shared wiring). Reads its own env vars so the
// gasless path can be toggled/pointed independently of the rest of the app. See
// shop/design/GASLESS_SPEC.md.
//
// - VITE_GASLESS_CHECKOUT: '1' | 'true' turns gasless ON. Default OFF → normal buyer-submitted
//   checkout (lib/buy.ts) stays the default and the safety net.
// - VITE_RELAYER_URL: the meta-transaction relayer base URL (transactions-server shape). The
//   POST target is `${VITE_RELAYER_URL}/transactions`. Defaults to DCL's shared dev relayer,
//   which is configured for polygon-amoy (chain 80002) — the Shop's target chain.

const flag = (import.meta.env.VITE_GASLESS_CHECKOUT ?? '') as string

export const gaslessConfig = {
  enabled: flag === '1' || flag.toLowerCase() === 'true',
  // DCL transactions-server (fronts the OpenZeppelin Relayer). Amoy/dev by default.
  relayerUrl: (import.meta.env.VITE_RELAYER_URL as string | undefined) ?? 'https://transactions-api.decentraland.zone/v1'
}

// Cheap predicate for call sites choosing between buyGasless and buyWithCredits.
export function gaslessEnabled(): boolean {
  return gaslessConfig.enabled
}
