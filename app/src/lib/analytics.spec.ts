import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { ProviderType } from '@dcl/schemas'
import {
  track,
  trackPage,
  identify,
  reset,
  signInMethod,
  markAddressSeen,
  creditsToUsd,
  isPrimaryItem,
  itemProps,
  purchaseItemsProps,
  errorCode,
  isUserRejection,
  initAnalytics
} from './analytics'
import { useWallet } from '~/store/wallet'
import type { CatalogItem } from '~/lib/api'

const item = (over: Partial<CatalogItem> = {}): CatalogItem => ({
  id: 't1',
  name: 'X',
  creator: '0xcreator',
  contractAddress: '0xabc',
  itemId: '5',
  category: 'wearable',
  rarity: 'rare',
  network: 'MATIC',
  chainId: 80002,
  thumbnail: '',
  priceCredits: 20,
  gender: null,
  isSmart: false,
  ...over
})

const CHROME = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131.0 Safari/537.36'
const GOOGLEBOT = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'

const ORIGINAL_USER_AGENT = navigator.userAgent

function setUserAgent(userAgent: string) {
  Object.defineProperty(navigator, 'userAgent', { value: userAgent, configurable: true })
}

function analyticsGlobal() {
  return (window as unknown as { analytics?: { _cdn?: string; _writeKey?: string } }).analytics
}

// The snippet may insert its script before an existing one instead of appending to <head>, so look it
// up by the attribute Segment marks it with rather than by spying on a single insertion method.
function loadedScript() {
  return document.querySelector<HTMLScriptElement>('script[data-global-segment-analytics-key]')
}

/**
 * Re-imports the analytics module against a forced config and user agent. A fresh import is what lets a
 * spec exercise the loader at all: the module resolves its config, its bot check and its `initialized`
 * latch once, at import time.
 */
async function loadAnalytics(configOverrides: Record<string, unknown>, userAgent = CHROME) {
  document.querySelectorAll('script[data-global-segment-analytics-key]').forEach(node => node.remove())
  ;(window as unknown as { analytics?: unknown }).analytics = undefined
  setUserAgent(userAgent)
  vi.resetModules()
  vi.doMock('~/config', () => ({
    config: { chainId: 80002, network: 'polygon', appEnv: 'test', segmentAnalyticsUrl: '', ...configOverrides }
  }))
  return import('./analytics')
}

beforeEach(() => {
  ;(window as unknown as { analytics?: unknown }).analytics = undefined
  useWallet.setState({ session: null })
})

afterEach(() => {
  vi.doUnmock('~/config')
  vi.resetModules()
  setUserAgent(ORIGINAL_USER_AGENT)
  document.querySelectorAll('script[data-global-segment-analytics-key]').forEach(node => node.remove())
  ;(window as unknown as { analytics?: unknown }).analytics = undefined
})

describe('analytics wrapper', () => {
  it('no-ops (never throws) when Segment is not loaded', () => {
    expect(() => track('Shop Viewed Item', { item_id: '5' })).not.toThrow()
    expect(() => identify('0xabc')).not.toThrow()
  })

  it('sends the event with the injected context when Segment is loaded', () => {
    const spy = vi.fn()
    ;(window as unknown as { analytics?: unknown }).analytics = { track: spy, identify: vi.fn(), page: vi.fn() }
    useWallet.setState({ session: { address: '0xBUYER' } as never })

    track('Shop Viewed Item', { item_id: '5' })

    expect(spy).toHaveBeenCalledTimes(1)
    const [event, props] = spy.mock.calls[0]
    expect(event).toBe('Shop Viewed Item')
    expect(props).toMatchObject({
      item_id: '5',
      address: '0xBUYER',
      is_signed_in: true,
      network: 'amoy',
      app_env: 'dev'
    })
    expect(typeof props.session_id).toBe('string')
  })

  it('marks anonymous events with a null address / is_signed_in false', () => {
    const spy = vi.fn()
    ;(window as unknown as { analytics?: unknown }).analytics = { track: spy, identify: vi.fn(), page: vi.fn() }
    track('Shop Viewed Page', { page: 'overview' })
    expect(spy.mock.calls[0][1]).toMatchObject({ address: null, is_signed_in: false })
  })

  it('reset drops the Segment identity when loaded, and never throws when it is not', () => {
    const spy = vi.fn()
    ;(window as unknown as { analytics?: unknown }).analytics = {
      track: vi.fn(),
      identify: vi.fn(),
      page: vi.fn(),
      reset: spy
    }
    reset()
    expect(spy).toHaveBeenCalledTimes(1)

    ;(window as unknown as { analytics?: unknown }).analytics = undefined
    expect(() => reset()).not.toThrow()
  })

  it('creditsToUsd: 1 credit = $0.10', () => {
    expect(creditsToUsd(20)).toBe(2)
    expect(creditsToUsd(19)).toBe(1.9)
    expect(creditsToUsd(0)).toBe(0)
  })

  it('isPrimaryItem: primary when there is no tokenId', () => {
    expect(isPrimaryItem({ itemId: '5', tokenId: undefined })).toBe(true)
    expect(isPrimaryItem({ itemId: null, tokenId: '9' })).toBe(false)
  })

  it('itemProps carries the public join keys + both prices', () => {
    const p = itemProps(item({ priceCredits: 20 }))
    expect(p).toMatchObject({
      item_id: '5',
      contract_address: '0xabc',
      price_credits: 20,
      price_usd: 2,
      is_primary: true
    })
  })

  it('purchaseItemsProps tags purchase_type explicitly and sums the value', () => {
    const p = purchaseItemsProps([
      item({ priceCredits: 20 }),
      item({ id: 't2', priceCredits: 19, itemId: null, tokenId: '9' })
    ])
    expect(p.value_credits).toBe(39)
    expect(p.value_usd).toBe(3.9)
    expect(p.purchase_type).toBe('item') // any primary in the cart → 'item'
    expect((p.items as unknown[]).length).toBe(2)
  })

  it('purchaseItemsProps → nft_resale when nothing is primary', () => {
    const p = purchaseItemsProps([item({ itemId: null, tokenId: '9' })])
    expect(p.purchase_type).toBe('nft_resale')
    expect(p.is_primary).toBe(false)
  })

  it('purchaseItemsProps counts the units an outfit contributed, so an outfit sale is countable', () => {
    const p = purchaseItemsProps([
      { ...item({ id: 'a' }), source: 'outfit', outfitId: 'fit-1' },
      { ...item({ id: 'b' }), source: 'outfit', outfitId: 'fit-1' },
      { ...item({ id: 'c' }), source: 'grid' }
    ])
    expect(p.units_from_outfit).toBe(2)
    expect(p.outfit_ids).toEqual(['fit-1'])
    const items = p.items as Array<{ source: string | null; outfit_id: string | null }>
    expect(items.map(i => i.source)).toEqual(['outfit', 'outfit', 'grid'])
    expect(items[2].outfit_id).toBeNull()
  })

  it('purchaseItemsProps dedupes and sorts outfit ids when a basket mixes two looks', () => {
    const p = purchaseItemsProps([
      { ...item({ id: 'a' }), source: 'outfit', outfitId: 'fit-b' },
      { ...item({ id: 'b' }), source: 'outfit', outfitId: 'fit-a' },
      { ...item({ id: 'c' }), source: 'outfit', outfitId: 'fit-b' }
    ])
    expect(p.outfit_ids).toEqual(['fit-a', 'fit-b'])
    expect(p.units_from_outfit).toBe(3)
  })

  it('purchaseItemsProps reports no outfit as null, not an empty array', () => {
    const p = purchaseItemsProps([item()])
    expect(p.outfit_ids).toBeNull()
    expect(p.units_from_outfit).toBe(0)
  })

  it('purchaseItemsProps carries per-item category so a basket can be split by asset type', () => {
    const p = purchaseItemsProps([item({ category: 'wearable', isSmart: true }), item({ id: 't2', category: 'emote' })])
    const items = p.items as Array<{ category: string; is_smart: boolean }>
    expect(items.map(i => i.category)).toEqual(['wearable', 'emote'])
    expect(items[0].is_smart).toBe(true)
    expect(items[1].is_smart).toBe(false)
  })

  it('itemProps carries category and is_smart', () => {
    const p = itemProps(item({ category: 'emote' }))
    expect(p.category).toBe('emote')
    expect(p.is_smart).toBe(false)
  })

  it('errorCode / isUserRejection bucket errors coarsely', () => {
    expect(errorCode({ code: 4001 })).toBe('user_rejected')
    expect(isUserRejection({ message: 'User denied the request' })).toBe(true)
    expect(errorCode({ message: 'insufficient credits' })).toBe('insufficient_credits')
    expect(errorCode({ message: 'boom' })).toBe('unknown')
    expect(isUserRejection({ message: 'boom' })).toBe(false)
  })

  it('trackPage sends the Shop Viewed Page event with the page prop', () => {
    const spy = vi.fn()
    ;(window as unknown as { analytics?: unknown }).analytics = { track: spy, identify: vi.fn(), page: vi.fn() }

    trackPage('overview')

    expect(spy).toHaveBeenCalledTimes(1)
    const [event, props] = spy.mock.calls[0]
    expect(event).toBe('Shop Viewed Page')
    expect(props).toMatchObject({ page: 'overview' })
  })

  it('identify lowercases the address when Segment is loaded', () => {
    const spy = vi.fn()
    ;(window as unknown as { analytics?: unknown }).analytics = { track: vi.fn(), identify: spy, page: vi.fn() }

    identify('0xABCdef', { plan: 'free' })

    expect(spy).toHaveBeenCalledWith('0xabcdef', { plan: 'free' })
  })

  it('track swallows a store read that throws and still sends the event', () => {
    const spy = vi.fn()
    ;(window as unknown as { analytics?: unknown }).analytics = { track: spy, identify: vi.fn(), page: vi.fn() }
    const getState = vi.spyOn(useWallet, 'getState').mockImplementation(() => {
      throw new Error('store exploded')
    })

    expect(() => track('Shop Viewed Item')).not.toThrow()
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0][1]).toMatchObject({ address: null, is_signed_in: false })

    getState.mockRestore()
  })

  it('errorCode buckets a not-for-sale listing failure', () => {
    expect(errorCode({ message: 'No active listing for this item' })).toBe('not_for_sale')
    expect(errorCode({ message: 'This NFT was already sold' })).toBe('not_for_sale')
    expect(errorCode({ message: 'Item not for sale' })).toBe('not_for_sale')
  })

  it('errorCode maps a wallet cancel message to user_rejected', () => {
    expect(errorCode({ message: 'Transaction cancelled by user' })).toBe('user_rejected')
    expect(errorCode({ message: 'MetaMask Tx Signature: User rejected' })).toBe('user_rejected')
  })

  it('errorCode returns unknown for null/undefined/plain errors', () => {
    expect(errorCode(null)).toBe('unknown')
    expect(errorCode(undefined)).toBe('unknown')
    expect(errorCode(new Error('something else'))).toBe('unknown')
  })
})

describe('signInMethod', () => {
  it('buckets Magic / Magic-test providers as magic', () => {
    expect(signInMethod(ProviderType.MAGIC)).toBe('magic')
    expect(signInMethod(ProviderType.MAGIC_TEST)).toBe('magic')
  })

  it('buckets any self-custody provider (or none) as wallet', () => {
    expect(signInMethod(ProviderType.INJECTED)).toBe('wallet')
    expect(signInMethod(null)).toBe('wallet')
    expect(signInMethod(undefined)).toBe('wallet')
  })
})

describe('markAddressSeen', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('returns true the first time an address is seen, false afterwards', () => {
    expect(markAddressSeen('0xNEWuser')).toBe(true)
    expect(markAddressSeen('0xNEWuser')).toBe(false)
  })

  it('is case-insensitive on the address', () => {
    expect(markAddressSeen('0xAbC')).toBe(true)
    expect(markAddressSeen('0xabc')).toBe(false)
  })

  it('returns false (best-effort) when localStorage throws', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled')
    })

    expect(markAddressSeen('0xdead')).toBe(false)

    getItem.mockRestore()
  })
})

describe('initAnalytics', () => {
  it('no-ops when no Segment write key is configured (test env)', () => {
    const appendChild = vi.spyOn(document.head, 'appendChild')

    expect(() => initAnalytics()).not.toThrow()
    // With an empty VITE_SEGMENT_WRITE_KEY the loader never runs → no analytics stub, no script.
    expect((window as unknown as { analytics?: unknown }).analytics).toBeUndefined()
    expect(appendChild).not.toHaveBeenCalled()

    appendChild.mockRestore()
  })

  it('is idempotent — a second call is still a no-op', () => {
    const appendChild = vi.spyOn(document.head, 'appendChild')

    initAnalytics()
    initAnalytics()

    expect(appendChild).not.toHaveBeenCalled()
    appendChild.mockRestore()
  })

  it('loads the Segment script (positive path) when a write key IS present', async () => {
    // The other tests exercise the empty-key path (test env blanks the key). Here we force a key via
    // a scoped config mock + a fresh module import so `initialized` is reset, and assert the loader runs.
    const mod = await loadAnalytics({ segmentWriteKey: 'wk_test' })
    mod.initAnalytics()

    expect(loadedScript()).not.toBeNull()
    expect((window as unknown as { analytics?: unknown }).analytics).toBeDefined()
  })
})

// A configured analytics url must reach BOTH the bundle and the settings request: analytics.js resolves
// its settings endpoint from `_cdn`, so a proxy that only serves the script still gets blocked.
describe('first-party analytics proxy', () => {
  const PROXY = 'https://evs.example.org/eas.js'

  it('serves analytics.js from the configured proxy and points the settings endpoint at it', async () => {
    const mod = await loadAnalytics({ segmentWriteKey: 'wk_test', segmentAnalyticsUrl: PROXY })
    mod.initAnalytics()

    expect(loadedScript()?.src).toBe(PROXY)
    expect(analyticsGlobal()?._cdn).toBe('https://evs.example.org')
  })

  it("falls back to Segment's CDN when no proxy url is configured", async () => {
    const mod = await loadAnalytics({ segmentWriteKey: 'wk_test', segmentAnalyticsUrl: '' })
    mod.initAnalytics()

    expect(loadedScript()?.src).toContain('https://cdn.segment.com/analytics.js/')
    expect(analyticsGlobal()?._cdn).toBeUndefined()
  })

  it("falls back to Segment's CDN when the configured proxy url is not usable", async () => {
    const mod = await loadAnalytics({
      segmentWriteKey: 'wk_test',
      segmentAnalyticsUrl: 'http://insecure.example.org/analytics.min.js'
    })
    mod.initAnalytics()

    expect(loadedScript()?.src).toContain('https://cdn.segment.com/analytics.js/')
    expect(analyticsGlobal()?._cdn).toBeUndefined()
  })

  it('still tracks through the proxied analytics once it has loaded', async () => {
    const mod = await loadAnalytics({ segmentWriteKey: 'wk_test', segmentAnalyticsUrl: PROXY })
    mod.initAnalytics()
    const spy = vi.fn()
    ;(window as unknown as { analytics?: unknown }).analytics = {
      track: spy,
      identify: vi.fn(),
      page: vi.fn(),
      initialize: () => {}
    }

    mod.track('Shop Viewed Page', { page: 'overview' })

    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('does not send events when analytics was never loaded (no write key)', async () => {
    const mod = await loadAnalytics({ segmentWriteKey: '' })
    mod.initAnalytics()

    expect(loadedScript()).toBeNull()
    expect(() => mod.track('Shop Viewed Page', { page: 'overview' })).not.toThrow()
    // The snippet's queue is not a destination: nothing was loaded, so nothing will ever flush it.
    expect(analyticsGlobal()?._writeKey).toBeUndefined()
  })
})

describe('analytics identity for the support widget', () => {
  // Stands in for a loaded analytics.js: `initialize` is what marks it as the real one.
  function loadedAnalytics() {
    return {
      track: vi.fn(),
      identify: vi.fn(),
      page: vi.fn(),
      initialize: () => {},
      ready: (callback: () => void) => callback(),
      user: () => ({ anonymousId: () => 'anon-42' })
    }
  }

  it('tells a listener that registered before analytics started, so a conversation carries the anon id', async () => {
    // React runs a child's effect before its parent's: the Intercom widget asks for the id before App
    // has called initAnalytics, and dropping that request left every conversation without an anon_id.
    const mod = await loadAnalytics({ segmentWriteKey: 'wk_test' })
    const listener = vi.fn()
    mod.onAnalyticsReady(listener)
    expect(listener).not.toHaveBeenCalled()
    ;(window as unknown as { analytics?: unknown }).analytics = loadedAnalytics()

    mod.initAnalytics()

    expect(listener).toHaveBeenCalled()
    expect(mod.anonymousId()).toBe('anon-42')
  })

  it('runs a listener registered after analytics started', async () => {
    const mod = await loadAnalytics({ segmentWriteKey: 'wk_test' })
    ;(window as unknown as { analytics?: unknown }).analytics = loadedAnalytics()
    mod.initAnalytics()
    const listener = vi.fn()

    mod.onAnalyticsReady(listener)

    expect(listener).toHaveBeenCalled()
  })

  it('never calls a listener when analytics is off, and reports no id', async () => {
    const mod = await loadAnalytics({ segmentWriteKey: '' })
    const listener = vi.fn()
    mod.onAnalyticsReady(listener)

    mod.initAnalytics()

    expect(listener).not.toHaveBeenCalled()
    expect(mod.anonymousId()).toBeUndefined()
  })

  it('never calls a listener for a crawler', async () => {
    const mod = await loadAnalytics({ segmentWriteKey: 'wk_test' }, GOOGLEBOT)
    const listener = vi.fn()
    mod.onAnalyticsReady(listener)

    mod.initAnalytics()

    expect(listener).not.toHaveBeenCalled()
    expect(mod.anonymousId()).toBeUndefined()
  })
})

describe('bot traffic', () => {
  it('sends nothing at all when the visitor is a crawler', async () => {
    const mod = await loadAnalytics({ segmentWriteKey: 'wk_test' }, GOOGLEBOT)
    mod.initAnalytics()

    // No loader ran...
    expect(loadedScript()).toBeNull()
    // ...and every entry point is inert, even with a live analytics object on the page.
    const track = vi.fn()
    const ident = vi.fn()
    const page = vi.fn()
    const segmentReset = vi.fn()
    ;(window as unknown as { analytics?: unknown }).analytics = {
      track,
      identify: ident,
      page,
      reset: segmentReset,
      initialize: () => {}
    }

    mod.track('Shop Viewed Item', { item_id: '5' })
    mod.trackPage('overview')
    mod.identify('0xabc')
    mod.reset()

    expect(track).not.toHaveBeenCalled()
    expect(ident).not.toHaveBeenCalled()
    expect(page).not.toHaveBeenCalled()
    expect(segmentReset).not.toHaveBeenCalled()
  })

  it('keeps tracking for an ordinary browser user agent', async () => {
    const mod = await loadAnalytics({ segmentWriteKey: 'wk_test' }, CHROME)
    const spy = vi.fn()
    ;(window as unknown as { analytics?: unknown }).analytics = {
      track: spy,
      identify: vi.fn(),
      page: vi.fn(),
      initialize: () => {}
    }

    mod.track('Shop Viewed Item', { item_id: '5' })

    expect(spy).toHaveBeenCalledTimes(1)
  })
})
