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
// The relayer URL is NOT read here: it comes from `config.relayerUrl`, i.e. the per-env JSONs, like every
// other host in the app. It used to be read straight off VITE_RELAYER_URL with a hard-coded fallback to the
// zone (Amoy) relayer, and no env JSON carried the key — so production relayed to zone, the prod CSP blocked
// it, and gasless silently never worked there.

import { config } from '~/config'

const flag = (import.meta.env.VITE_GASLESS_CHECKOUT ?? '').trim().toLowerCase()

export const gaslessConfig = {
  // On unless explicitly disabled. `useCredits` from a buyer-submitted tx requires the wallet to be on
  // the Shop's chain (a wrong-chain tx is a no-op that still "succeeds"); the meta-tx path has no such
  // footgun, so it's the default.
  enabled: flag !== '0' && flag !== 'false',
  // DCL transactions-server (fronts the OpenZeppelin Relayer), per environment. No fallback on purpose:
  // a relayer only submits on the chain it is configured for, so a default belonging to another environment
  // would not fail — it would relay to the wrong chain, or be refused by the CSP, which is what happened.
  relayerUrl: config.relayerUrl
}

// Cheap predicate for call sites choosing between buyGasless and buyWithCredits.
export function gaslessEnabled(): boolean {
  return gaslessConfig.enabled
}
