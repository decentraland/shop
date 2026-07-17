// Segment analytics wrapper for the Shop's behavioral funnel (Plane B — see
// design/SHOP_TRACKING_SPEC.md + METRICS_AND_KRS.md). This is the ONLY place the app talks to Segment:
// components call `track`/`identify`/`trackPage`, never window.analytics directly.
//
// - No-ops (logs to console in dev) when VITE_SEGMENT_WRITE_KEY is empty, so local/dev never sends.
// - Injects the common context props on every event (address, is_signed_in, session_id, network, app_env).
// - Event names/props are INTERNAL (precise); nothing here is user-facing, so no web2/web3 copy rules apply.
// - Never emit PII, secrets, or .env values. Wallet addresses are pseudonymous public ids (allowed).
import { ProviderType } from '@dcl/schemas'
import { config } from '~/config'
import { useWallet } from '~/store/wallet'
import type { CatalogItem } from '~/lib/api'

type Props = Record<string, unknown>

type SegmentApi = {
  track: (event: string, props?: Props) => void
  identify: (id: string, traits?: Props) => void
  page: (name?: string, props?: Props) => void
  reset?: () => void
  load?: (writeKey: string) => void
  invoked?: boolean
}

// A per-page-load id so funnel steps from one visit stitch together (not a wallet/tx concept).
const SESSION_ID =
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `s-${String(performance.now())}`

const NETWORK = config.chainId === 80002 ? 'amoy' : 'polygon'
const APP_ENV = config.chainId === 80002 ? 'dev' : 'prod'

function segment(): SegmentApi | undefined {
  return (window as unknown as { analytics?: SegmentApi }).analytics
}

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
  const a = segment()
  if (a) a.track(event, payload)
  else if (import.meta.env.DEV) console.debug('[analytics] track', event, payload)
}

export function identify(address: string, traits: Props = {}): void {
  const a = segment()
  if (a) a.identify(address.toLowerCase(), traits)
  else if (import.meta.env.DEV) console.debug('[analytics] identify', address, traits)
}

// Drops the current identity + anonymousId association so events after sign-out (and the next
// account's sign-in) aren't attributed to the previous account. Called on disconnect.
export function reset(): void {
  const a = segment()
  if (a?.reset) a.reset()
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
    is_primary: isPrimaryItem(item)
  }
}

// Purchase props for `Shop Completed Purchase` — carries the reconciliation keys (spec §6) so the
// warehouse can join the funnel event to on-chain settlement. purchase_type is tagged EXPLICITLY
// (never inferred): 'item' = primary (creator mint), 'nft_resale' = secondary.
export function purchaseItemsProps(items: CatalogItem[]): Props {
  const valueCredits = items.reduce((n, i) => n + i.priceCredits, 0)
  const anyPrimary = items.some(isPrimaryItem)
  return {
    items: items.map(i => ({
      item_id: i.itemId ?? null,
      contract_address: i.contractAddress,
      token_id: i.tokenId ?? null,
      price_usd: creditsToUsd(i.priceCredits)
    })),
    value_credits: valueCredits,
    value_usd: creditsToUsd(valueCredits),
    purchase_type: anyPrimary ? 'item' : 'nft_resale',
    is_primary: anyPrimary
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

// Standard Segment analytics.js loader (dependency-free). Only runs when a write key is configured.
function loadSegment(writeKey: string): void {
  const w = window as unknown as { analytics?: SegmentApi & Props }
  if (w.analytics && (w.analytics as SegmentApi).invoked) return
  const analytics: SegmentApi & { methods?: string[]; factory?: (m: string) => unknown; push?: unknown } & Props =
    (w.analytics as never) || ([] as never)
  analytics.invoked = true
  analytics.methods = [
    'track',
    'identify',
    'page',
    'group',
    'alias',
    'ready',
    'on',
    'once',
    'off',
    'reset',
    'setAnonymousId'
  ]
  analytics.factory =
    (method: string) =>
    (...args: unknown[]) => {
      ;(analytics as unknown as { push: (a: unknown[]) => void }).push([method, ...args])
      return analytics
    }
  for (const method of analytics.methods) {
    ;(analytics as unknown as Props)[method] = analytics.factory(method)
  }
  analytics.load = (key: string) => {
    const script = document.createElement('script')
    script.async = true
    script.src = `https://cdn.segment.com/analytics.js/v1/${encodeURIComponent(key)}/analytics.min.js`
    document.head.appendChild(script)
  }
  w.analytics = analytics
  analytics.load(writeKey)
  ;(analytics as SegmentApi).page()
}

let initialized = false
export function initAnalytics(): void {
  if (initialized) return
  initialized = true
  const writeKey = config.segmentWriteKey
  if (!writeKey) {
    if (import.meta.env.DEV) console.debug('[analytics] no VITE_SEGMENT_WRITE_KEY → events log to console only')
    return
  }
  loadSegment(writeKey)
}
