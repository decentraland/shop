// Segment analytics wrapper for the Shop's behavioral funnel (Plane B — see
// design/SHOP_TRACKING_SPEC.md + METRICS_AND_KRS.md). This is the ONLY place the app talks to Segment:
// components call `track`/`identify`/`trackPage`, never the Segment instance directly.
//
// - Loading is NOT this module's job: the AnalyticsProvider in main.tsx owns it, and this reads the
//   instance back through @dcl/hooks so the zustand stores and the imperative flows can track too.
// - No-ops (logs to console in dev) while no instance is registered: an env with an empty configured
//   write key, a bot session, or a call made before the provider mounted. Vite's dev mode is NOT one of
//   those cases: the dev config ships a real write key and does send.
// - Injects the common context props on every event (address, is_signed_in, session_id, network, app_env).
// - Event names/props are INTERNAL (precise); nothing here is user-facing, so no web2/web3 copy rules apply.
// - Never emit PII, secrets, or .env values. Wallet addresses are pseudonymous public ids (allowed).
import { ProviderType } from '@dcl/schemas'
import { getAnalytics } from '@dcl/hooks'
import { config } from '~/config'
import { useWallet } from '~/store/wallet'
import type { CatalogItem } from '~/lib/api'

type Props = Record<string, unknown>

// A per-page-load id so funnel steps from one visit stitch together (not a wallet/tx concept).
const SESSION_ID =
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `s-${String(performance.now())}`

const NETWORK = config.chainId === 80002 ? 'amoy' : 'polygon'
const APP_ENV = config.chainId === 80002 ? 'dev' : 'prod'

// Context props stamped on every event. Reads the wallet store imperatively so pre-/post-login events
// share the same anonymousId and post-login events carry the address. Never let a store read (or a
// mocked store in tests) break the flow that's tracking — tracking is best-effort.
function context(): Props {
  let session: ReturnType<typeof useWallet.getState>['session'] | null
  try {
    session = useWallet.getState().session
  } catch {
    session = null
  }
  return {
    address: session?.address ?? null,
    is_signed_in: !!session,
    session_id: SESSION_ID,
    network: NETWORK,
    app_env: APP_ENV
  }
}

export function track(event: string, props: Props = {}): void {
  const payload = { ...context(), ...props }
  const a = getAnalytics()
  if (a) void a.track(event, payload)
  else if (import.meta.env.DEV) console.debug('[analytics] track', event, payload)
}

export function identify(address: string, traits: Props = {}): void {
  const a = getAnalytics()
  if (a) void a.identify(address.toLowerCase(), traits)
  else if (import.meta.env.DEV) console.debug('[analytics] identify', address, traits)
}

// Drops the current identity + anonymousId association so events after sign-out (and the next
// account's sign-in) aren't attributed to the previous account. Called on disconnect.
export function reset(): void {
  const a = getAnalytics()
  if (a) void a.reset()
  else if (import.meta.env.DEV) console.debug('[analytics] reset')
}

export function trackPage(page: string): void {
  track('Shop Viewed Page', { page })
}

// Sign-in method bucket for `Shop Signed In` (web2-friendly: Magic/social vs any self-custody wallet).
export function signInMethod(providerType?: ProviderType | null): string {
  if (providerType === ProviderType.MAGIC || providerType === ProviderType.MAGIC_TEST) return 'magic'
  return 'wallet'
}

// First time we've seen this address sign in on this browser → treat as a new user (best-effort proxy).
export function markAddressSeen(address: string): boolean {
  const key = `shop:seen:${address.toLowerCase()}`
  try {
    if (localStorage.getItem(key)) return false
    localStorage.setItem(key, '1')
    return true
  } catch {
    return false
  }
}

// 1 credit = $0.10.
export function creditsToUsd(credits: number): number {
  return Math.round(credits * 10) / 100
}

// Primary = a creator's first sale (mint via public_item_order). Catalog items from a primary listing
// resolve by itemId and carry no specific tokenId; secondary listings carry a tokenId.
export function isPrimaryItem(item: Pick<CatalogItem, 'itemId' | 'tokenId'>): boolean {
  return !item.tokenId
}

// The reconciliation-friendly shape for one item in a purchase/view event (see spec §6). Only public,
// non-PII ids + the price.
export function itemProps(item: CatalogItem): Props {
  return {
    item_id: item.itemId ?? null,
    contract_address: item.contractAddress,
    token_id: item.tokenId ?? null,
    trade_id: item.tradeId ?? null,
    price_credits: item.priceCredits,
    price_usd: creditsToUsd(item.priceCredits),
    rarity: item.rarity,
    creator: item.creator || null,
    category: item.category,
    is_smart: item.isSmart ?? false,
    is_primary: isPrimaryItem(item)
  }
}

/**
 * Where a purchased unit came from, as carried on the cart line since it was added.
 *
 * Typed structurally instead of importing `CartProvenance` from `~/store/cart`: that module already
 * imports this one, and pulling the type back the other way would close a cycle. Both halves are
 * optional because a direct buy (BuyModal) never passes through the cart and has no provenance.
 */
export type PurchaseProvenance = { source?: string; outfitId?: string }

// Purchase props for `Shop Completed Purchase` — carries the reconciliation keys (spec §6) so the
// warehouse can join the funnel event to on-chain settlement. purchase_type is tagged EXPLICITLY
// (never inferred): 'item' = primary (creator mint), 'nft_resale' = secondary.
//
// `outfit_ids` / `units_from_outfit` are what make an outfit sale countable: an outfit adds its pieces
// as ordinary wearable lines, so without them a bought look is indistinguishable from unrelated items
// and outfit revenue reads as zero. Event-level rather than per-item only, so counting outfit sales
// does not require unnesting the items array.
export function purchaseItemsProps(items: Array<CatalogItem & PurchaseProvenance>): Props {
  const valueCredits = items.reduce((n, i) => n + i.priceCredits, 0)
  const anyPrimary = items.some(isPrimaryItem)
  const outfitIds = [...new Set(items.map(i => i.outfitId).filter((id): id is string => !!id))].sort()
  return {
    items: items.map(i => ({
      item_id: i.itemId ?? null,
      contract_address: i.contractAddress,
      token_id: i.tokenId ?? null,
      price_usd: creditsToUsd(i.priceCredits),
      category: i.category,
      is_smart: i.isSmart ?? false,
      source: i.source ?? null,
      outfit_id: i.outfitId ?? null
    })),
    value_credits: valueCredits,
    value_usd: creditsToUsd(valueCredits),
    purchase_type: anyPrimary ? 'item' : 'nft_resale',
    is_primary: anyPrimary,
    // Null rather than [] so "no outfit involved" is one check in SQL, matching how the other
    // never-happened props on these events read.
    outfit_ids: outfitIds.length ? outfitIds : null,
    units_from_outfit: items.filter(i => !!i.outfitId).length
  }
}

// Coarse error bucket for purchase/listing failure events (never the raw message).
export function errorCode(e: unknown): string {
  const err = e as { code?: number | string; message?: string }
  if (err?.code === 4001) return 'user_rejected'
  const msg = (err?.message ?? '').toLowerCase()
  if (msg.includes('reject') || msg.includes('denied') || msg.includes('cancel')) return 'user_rejected'
  if (msg.includes('insufficient')) return 'insufficient_credits'
  if (msg.includes('not for sale') || msg.includes('no active listing') || msg.includes('sold')) return 'not_for_sale'
  return 'unknown'
}

export function isUserRejection(e: unknown): boolean {
  return errorCode(e) === 'user_rejected'
}
