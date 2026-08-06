/**
 * iOS in-app-purchase mode: the Shop rendered inside the mobile app's web view.
 *
 * Apple requires that digital currency be sold through In-App Purchase, so in this mode the Shop must not
 * offer to sell credits — the app sells them itself. Everything else about the Shop is already fine to
 * show: browsing, prices in credits, and spending a balance the buyer already has.
 *
 * Same query param and value the Marketplace already uses for this (`?view=mobile-iap`, see its
 * `modules/store.ts`), so the app passes one flag to both and nobody has to remember two spellings.
 *
 * READ ONCE AND STICKY, which is the whole reason this is a module and not a `useSearchParams` call. The
 * param arrives on the URL the web view loads, and the Shop's own navigations do not carry it forward — so
 * reading it per render would turn the credit-selling surfaces back on the moment the buyer opened an item.
 * The Marketplace solves the same problem by wrapping `history.push`/`replace` to re-inject the param,
 * because it also needs forced FILTERS to live in the URL where the queries can see them. Here the only
 * thing needed is a boolean, so remembering it is both simpler and impossible to lose.
 */
const VIEW_PARAM = 'view'
const IAP_VIEW = 'mobile-iap'

let cached: boolean | undefined

/** Whether the Shop is running inside the iOS app's web view. Stable for the lifetime of the session. */
export function isIapMode(): boolean {
  if (cached !== undefined) return cached
  try {
    cached = new URLSearchParams(window.location.search).get(VIEW_PARAM) === IAP_VIEW
  } catch {
    // No `window` (SSR / a test environment without a location) is not the web view.
    cached = false
  }
  return cached
}

/** Test seam: drops the memoised read so a spec can set a different URL. */
export function resetIapModeCache(): void {
  cached = undefined
}
