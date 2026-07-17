// Gasless-checkout feature flag + relayer config.
//
// NEW file. Does NOT touch src/config.ts (shared wiring). Reads its own env vars so the
// gasless path can be toggled/pointed independently of the rest of the app. See
// shop/design/GASLESS_SPEC.md.
//
// - VITE_GASLESS_CHECKOUT: gasless is the DEFAULT (web2-first — the buyer signs an off-chain meta-tx
//   and the relayer submits + pays gas on the Shop's chain, so checkout works from ANY network the
//   wallet happens to be on and never asks the buyer for gas). Opt OUT explicitly with '0' | 'false'
//   → falls back to normal buyer-submitted checkout (lib/buy.ts), which stays the safety net.
// - VITE_RELAYER_URL: the meta-transaction relayer base URL (transactions-server shape). The
//   POST target is `${VITE_RELAYER_URL}/transactions`. Defaults to DCL's shared dev relayer,
//   which is configured for polygon-amoy (chain 80002) — the Shop's target chain.

const flag = (import.meta.env.VITE_GASLESS_CHECKOUT ?? '').trim().toLowerCase()

export const gaslessConfig = {
  // On unless explicitly disabled. `useCredits` from a buyer-submitted tx requires the wallet to be on
  // the Shop's chain (a wrong-chain tx is a no-op that still "succeeds"); the meta-tx path has no such
  // footgun, so it's the default.
  enabled: flag !== '0' && flag !== 'false',
  // DCL transactions-server (fronts the OpenZeppelin Relayer). Amoy/dev by default.
  relayerUrl: import.meta.env.VITE_RELAYER_URL ?? 'https://transactions-api.decentraland.zone/v1'
}

// Cheap predicate for call sites choosing between buyGasless and buyWithCredits.
export function gaslessEnabled(): boolean {
  return gaslessConfig.enabled
}
