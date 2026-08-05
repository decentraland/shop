import puppeteer, { type Browser, type HTTPRequest, type Page } from 'puppeteer'
import { buildTestSession, sessionInitScript, type TestSession } from './session'
import { handleRpc, setManaBalanceWei, setManaAllowanceWei, ORACLE_RATE } from './rpc'
import * as fx from '../fixtures'

export const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:5273'

/**
 * The VITE_* a spec's dev server must pin so a run is hermetic.
 *
 * Two jobs. It points the app at the localhost hosts the per-page mock intercepts, and it BLANKS the
 * developer-only overrides — vite loads `.env.local` for every mode and those values win over
 * `process.env`, so a local `VITE_SHOP_SERVER_URL` or a forced feature-flag variant would silently
 * change what the suite asserts (an outfit-studio run pinned to the developer's own address rather
 * than the test wallet, for one). Empty strings, not `undefined`: vite only ignores a key that is
 * absent from the file, so the override has to be present-and-empty to lose.
 */
export function hermeticViteEnv(extra: Record<string, string> = {}): Record<string, string> {
  return {
    ...(process.env as Record<string, string>),
    VITE_MARKETPLACE_SERVER_URL: 'http://localhost:5003',
    VITE_CREDITS_SERVER_URL: 'http://localhost:3000',
    // The resolved 'dev' config ships a real Stripe publishable key, but the mocks don't cover
    // Stripe's hosted redirect — an empty key keeps isMockPayments() true.
    VITE_STRIPE_PK: '',
    // No shop-server unless a spec asks for one (outfits.e2e.ts): the notify-me and
    // secondary-sales specs assert the feature is dark when it is unconfigured.
    VITE_SHOP_SERVER_URL: '',
    VITE_FEATURE_FLAG_OVERRIDES: '',
    VITE_FEATURE_FLAG_VARIANT_OVERRIDES: '',
    ...extra
  }
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS'
}
// 1x1 transparent PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
)

// Per-run fixtures a spec can override (e.g. empty importable, a custom trade).
export type Fixtures = {
  credits: unknown
  importable: unknown
  shopListings: unknown
  collections: unknown
  creatorNames: unknown
  accounts: unknown
  legacyListings: unknown
  unifiedListings: unknown
  ownedNfts: unknown
  /** Rows served for a PUBLIC token lookup (no owner filter). Defaults to ownedNfts. */
  publicNfts: unknown
  builderCollections: unknown
  builderItems: unknown
  /** The builder's per-item contents map (file name → hash). A `video.mp4` entry is a showcase clip. */
  builderItemContents: Record<string, string>
  profile: unknown
  authorize: unknown
  trade: unknown
  userStore: unknown
  purchases: unknown
  sales: unknown
  notifications: unknown
  /** Outfit records served (and mutated) by the mock shop-server (port 5004). */
  outfits: unknown
  /** Week creator ranking (/v1/rankings/creators/week) — what fills the "Top Creators" section. */
  rankings: unknown
}

function defaults(): Fixtures {
  return {
    credits: fx.creditsResponse,
    importable: fx.importable,
    shopListings: fx.shopListings,
    collections: fx.collections,
    creatorNames: fx.creatorNames,
    accounts: fx.accounts,
    legacyListings: fx.legacyListings,
    unifiedListings: fx.unifiedListings,
    ownedNfts: fx.ownedNfts,
    publicNfts: fx.ownedNfts,
    builderCollections: fx.builderCollections,
    builderItems: fx.builderItems,
    builderItemContents: { 'thumbnail.png': 'bafyfake' },
    profile: fx.profile,
    userStore: null,
    authorize: {
      credit: {
        id: '0x' + '55'.repeat(32),
        amount: '1000000000000000000',
        availableAmount: '1000000000000000000',
        expiresAt: Math.floor(Date.now() / 1000) + 900,
        signature: '0x' + 'ab'.repeat(65),
        contract: '0x8052a560e6e6ac86eeb7e711a4497f639b322fb3'
      },
      maxCreditedValue: '1000000000000000000',
      usdCents: 2700,
      oracleRate: '26960836'
    },
    trade: null,
    outfits: { outfits: [] },
    // No ranking by default: the shipped marketplace-server answers this only on the chains it has
    // sales on, and "empty ranking → no section" is the behaviour most specs run in.
    rankings: { data: [] },
    purchases: { purchases: [] },
    sales: { data: [], total: 0 },
    // Two notifications, one unread — enough to prove the badge, the panel list and the mark-read flip.
    // Timestamps are epoch MILLISECONDS here; notifications.e2e.ts overrides this to cover the seconds /
    // ISO / unparseable shapes the real service has been seen to return.
    notifications: {
      notifications: [
        {
          id: 'ntf-1',
          type: 'item_sold',
          address: '0x0000000000000000000000000000000000000001',
          timestamp: 1750000000000,
          read: false,
          created_at: 1750000000000,
          updated_at: 1750000000000,
          metadata: {
            link: '/activity',
            title: 'Item sold',
            description: 'Nebula Jacket was sold',
            nftName: 'Nebula Jacket'
          }
        },
        {
          id: 'ntf-2',
          type: 'royalties_earned',
          address: '0x0000000000000000000000000000000000000001',
          timestamp: 1749000000000,
          read: true,
          created_at: 1749000000000,
          updated_at: 1749000000000,
          metadata: {
            link: '/activity',
            title: 'Royalties earned',
            description: 'You earned royalties',
            nftName: 'Nebula Jacket'
          }
        }
      ]
    }
  }
}

let sessionPromise: Promise<TestSession> | null = null
function session(): Promise<TestSession> {
  if (!sessionPromise) sessionPromise = buildTestSession()
  return sessionPromise
}

// Stateful top-up: the mock /dev/mint-usd stands in for a real Stripe→treasury→credit-grant, so a
// purchase must actually raise the balance the next /users/:addr/credits read returns — otherwise no
// e2e can prove that buying credits increases the balance. Accumulated per run (reset in launchApp).
let mintedCents = 0

// Stateful favorites: the mock marketplace picks service. A POSTed pick must survive navigation so
// the my-favorites page can prove the heart actually persisted server-side. Newest first, like the
// real service. Reset per run in launchApp.
let favoritePicks: string[] = []

// F.credits (creditsResponse) with the run's accumulated top-up folded into the usd block, so the
// balance chip reflects purchases made during the test.
function creditsWithTopup(F: Fixtures): unknown {
  const base = (F.credits ?? {}) as { usd?: { balanceCents?: number; credits?: number } }
  const usd = base.usd ?? { balanceCents: 0, credits: 0 }
  return {
    ...base,
    usd: {
      balanceCents: (usd.balanceCents ?? 0) + mintedCents,
      credits: (usd.credits ?? 0) + Math.round(mintedCents / 10)
    }
  }
}

function json(req: HTTPRequest, obj: unknown, status = 200) {
  return req.respond({ status, headers: { 'content-type': 'application/json', ...CORS }, body: JSON.stringify(obj) })
}

// A forced error response, keyed by URL pathname (opt-in per run via launchApp({ errors })).
type ErrorMap = Record<string, { status: number; body?: unknown }>

// Map a shop listing (fixtures shape) → a catalog row, serving both /v3/catalog/items (where
// lib/collections.ts reads the server-computed `priceCredits`) and /v2/catalog?id= (where the app reads
// `price` as MANA and converts at the live rate). Emitting both keeps each consumer on the field it
// really uses in production.
function toCatalogRow(l: any) {
  const priceCredits = Math.max(1, Math.round(l.priceCredits ?? 1))
  // The real /v2 catalog prices in MANA, and the app converts to credits at the live oracle rate. Emit
  // the MANA wei that converts BACK to the fixture's credits at the mocked rate, so a spec can keep
  // stating prices in credits while the code under test exercises the real conversion.
  const priceWei = String((BigInt(priceCredits) * 10n ** 17n * 10n ** 8n) / BigInt(ORACLE_RATE))
  // Mirror how the real /v2 row reports WHO is selling: `price` is the creator's mint (zero/absent once
  // the mint is closed), `minPrice` is the cheapest resale, and `available` is the remaining supply.
  // Outfits' discovery row admits a look only while every item is still buyable from its creator, so a
  // fixture that is resale-only or out of stock has to be able to say so here.
  const isResale = l.listingType === 'secondary' || !!l.tokenId
  return {
    id: `${l.contractAddress}-${l.itemId ?? l.tokenId ?? '0'}`,
    name: l.name,
    creator: l.creator,
    contractAddress: l.contractAddress,
    itemId: l.itemId ?? l.tokenId ?? '0',
    category: l.category,
    rarity: l.rarity,
    network: l.network,
    chainId: l.chainId,
    thumbnail: l.thumbnail ?? '',
    price: isResale ? null : priceWei,
    minPrice: priceWei,
    available: l.available ?? 0,
    priceCredits,
    // The item page reads `isSmart` and `utility` from the v1 items shape, where isSmart lives NESTED under
    // data.wearable (the catalog rows carry it flat). Kept faithful here so the smart-wearable badges and the
    // showcase-clip lookup exercise the same field they read in production.
    utility: l.utility ?? null,
    data: { wearable: { category: l.wearableCategory, isSmart: !!l.isSmart } }
  }
}

// Set per launchApp run; read by the flag-file handler below.
let secondarySalesFlag = true
let outfitCreatorFlag = false
let followsFlag = false

// Stateful outfits: the mock shop-server. Seeded from F.outfits per run so studio mutations (save,
// publish, delete) survive navigation within a test without leaking across runs.
let outfitStore: any[] = []

function route(req: HTTPRequest, F: Fixtures, errors: ErrorMap = {}, appBase: string = BASE) {
  const u = new URL(req.url())
  const method = req.method()
  const path = u.pathname

  // Same-origin app assets (vite dev server, whatever port the run's base resolves to) + inline
  // data: URIs → let through. Deriving the port from the base (not a hardcoded 5273) keeps the mock
  // working when the e2e server runs on a custom E2E_PORT or a spec-local server (outfits.e2e.ts).
  if (u.port === new URL(appBase).port || req.url().startsWith('data:')) return req.continue()
  // CORS preflight must always succeed (204) — even for a forced-error path below — so the browser
  // actually issues the real request (otherwise a preflight failure masks the intended error as a
  // generic "Failed to fetch"). The error is returned WITH CORS headers on the real request.
  if (method === 'OPTIONS') return req.respond({ status: 204, headers: CORS })
  // Decentraland feature flags. Unmocked this fetch fails and every flag reads false (fail-closed), which
  // would hide the secondary-sale surfaces the resale specs exist to cover. Serve them ON here so those
  // specs test the FEATURE; the hidden-by-default behaviour has its own spec that overrides this. Follows
  // are the other way round — off is the shipped state, so the suite runs in it and the follows spec opts in.
  if (path.endsWith('/dapps.json')) {
    return req.respond({
      status: 200,
      headers: { ...CORS, 'content-type': 'application/json' },
      body: JSON.stringify({
        flags: {
          'dapps-shop-secondary-sales': secondarySalesFlag,
          'dapps-shop-outfit-creators': outfitCreatorFlag,
          'dapps-shop-follows': followsFlag
        },
        variants: outfitCreatorFlag
          ? { 'dapps-shop-outfit-creators': { enabled: true, payload: { value: fx.TEST_ADDRESS } } }
          : {}
      })
    })
  }
  // Forced error injection (opt-in): before the normal per-port handling, respond with the mapped
  // status+body (json() attaches CORS headers, so the error reaches the app instead of being blocked).
  if (errors[path]) return json(req, errors[path].body ?? { error: 'forced' }, errors[path].status)
  // Web fonts → empty stylesheet (no external hit; system font falls back, same as the app).
  if (u.hostname.includes('fonts.google') || u.hostname.includes('gstatic')) {
    return req.respond({ status: 200, headers: { 'content-type': 'text/css', ...CORS }, body: '' })
  }

  // JSON-RPC read provider.
  if (u.hostname.includes('rpc-amoy') || u.hostname.includes('rpc.decentraland')) {
    return req.respond({
      status: 200,
      headers: { 'content-type': 'application/json', ...CORS },
      body: handleRpc(req.postData() || '{}')
    })
  }
  // Meta-transaction relayer (transactions-server): gasless checkout POSTs the signed useCredits
  // meta-tx here; the RPC mock then returns a status-1 receipt for the returned hash. Gasless is the
  // default checkout path, so the credit-buy flows exercise this.
  if (u.hostname.includes('transactions-api') && path.endsWith('/transactions')) {
    return json(req, { ok: true, txHash: '0x' + 'ab'.repeat(32) })
  }
  // WearablePreview iframe → a blank page that stands in for the external preview app. It can't run the
  // real Unity/Babylon runtime, so it reports Babylon via the same PreviewMessageType.LOAD message the
  // real app posts on scene load — driving onLoad/onRenderer so the overlay controls (which mount only
  // for the Babylon renderer) appear. Posts on a short interval to beat the parent's listener-attach race.
  if (u.hostname.includes('wearable-preview')) {
    return req.respond({
      status: 200,
      headers: { 'content-type': 'text/html', ...CORS },
      body:
        '<!doctype html><title>preview</title><script>' +
        'var m={type:"load",payload:{renderer:"babylon"}};' +
        'var n=0,i=setInterval(function(){parent.postMessage(m,"*");if(++n>20)clearInterval(i)},100);' +
        'parent.postMessage(m,"*");' +
        '</script>'
    })
  }
  // Images / builder content.
  if (path.includes('/contents/') || /\.(png|jpe?g|gif|svg|webp|ico)$/.test(path)) {
    return req.respond({ status: 200, headers: { 'content-type': 'image/png', ...CORS }, body: PNG })
  }

  // shop-server (:5004) — outfits + thumbnails. No signature verification (a mock trusts everyone);
  // the app's signed-fetch requests just pass through. Route order mirrors the real server: the
  // thumbnails paths must never match as an :id.
  if (u.port === '5004') {
    if (path === '/v1/outfits/thumbnails' && method === 'POST') {
      return json(req, { hash: 'e2e' + '0'.repeat(61) }, 201)
    }
    if (path.startsWith('/v1/outfits/thumbnails/')) {
      return req.respond({ status: 200, headers: { 'content-type': 'image/png', ...CORS }, body: PNG })
    }
    if (path === '/v1/outfits' && method === 'GET') {
      return json(req, { outfits: outfitStore.filter(o => o.published) })
    }
    if (path === '/v1/outfits/all') {
      return json(req, { outfits: outfitStore })
    }
    if (path === '/v1/outfits' && method === 'POST') {
      const body = JSON.parse(req.postData() || '{}')
      const existing = outfitStore.find(o => o.id === body.id)
      if (existing) return json(req, { outfit: existing })
      const outfit = { ...body, authorAddress: fx.TEST_ADDRESS, createdAt: Date.now(), updatedAt: Date.now() }
      outfitStore.push(outfit)
      return json(req, { outfit }, 201)
    }
    const idMatch = /^\/v1\/outfits\/([^/]+)$/.exec(path)
    if (idMatch) {
      const id = decodeURIComponent(idMatch[1])
      const index = outfitStore.findIndex(o => o.id === id)
      if (method === 'GET') {
        return index === -1
          ? json(req, { ok: false, error: 'not_found' }, 404)
          : json(req, { outfit: outfitStore[index] })
      }
      if (method === 'PUT') {
        if (index === -1) return json(req, { ok: false, error: 'not_found' }, 404)
        const body = JSON.parse(req.postData() || '{}')
        outfitStore[index] = { ...outfitStore[index], ...body, updatedAt: Date.now() }
        return json(req, { outfit: outfitStore[index] })
      }
      if (method === 'DELETE') {
        if (index !== -1) outfitStore.splice(index, 1)
        return json(req, { ok: true })
      }
    }
    return json(req, {})
  }

  // credits-server (:3000)
  if (u.port === '3000') {
    // Public pack catalogue (GET /credits/packs) — the shop's single source of truth for the pack
    // grid + no-funds pickers. Mirrors src/logic/credit-pack-catalog on the server.
    if (path === '/credits/packs')
      return json(req, {
        // KEEP IN STEP with src/lib/payments.ts CREDIT_PACKS, which mirrors the server catalogue. This is a
        // third copy of the price list and it cannot be derived from the second: importing src pulls in
        // `~/config`, and the e2e vitest config has no `~` alias, which breaks every spec at load time.
        // What catches a drift instead is the credits spec asserting the prices and the bonus badge — a
        // stale list here makes it fail, locally and in CI alike.
        packs: [
          { id: 'pack_5', usd: 5.99, credits: 40, order: 1 },
          { id: 'pack_10', usd: 11.99, credits: 100, recommended: true, order: 2 },
          { id: 'pack_25', usd: 29.99, credits: 260, order: 3 },
          { id: 'pack_50', usd: 59.99, credits: 540, order: 4 }
        ]
      })
    if (/\/users\/.+\/credits$/.test(path)) return json(req, creditsWithTopup(F))
    if (/\/users\/.+\/purchases$/.test(path)) return json(req, F.purchases)
    if (path === '/credits/authorize') return json(req, F.authorize)
    if (path === '/credits/authorize/cancel') return json(req, { released: 0 })
    if (path === '/dev/mint-usd') {
      // Fold the minted USD into the running balance so the post-purchase refetch shows the increase.
      const body = JSON.parse(req.postData() || '{}') as { usdCents?: number }
      mintedCents += Number(body.usdCents ?? 0)
      const usd = (creditsWithTopup(F) as { usd: { balanceCents: number; credits: number } }).usd
      return json(req, { id: 'x', usdCents: body.usdCents ?? 0, balanceCents: usd.balanceCents, credits: usd.credits })
    }
    return json(req, {})
  }

  // marketplace-server (:5003)
  if (u.port === '5003') {
    if (path === '/v3/catalog/importable') return json(req, F.importable)
    if (path === '/v3/catalog/shop') {
      const ca = u.searchParams.get('contractAddress')
      const itemId = u.searchParams.get('itemId')
      // fetchCollectionSaleState (contractAddress, no itemId) → treat as "not on sale".
      if (ca && !itemId) return json(req, { data: [], total: 0 })
      // Honor the server-side filters so filter/search/sort + item-detail specs are meaningful.
      let items = [...((F.shopListings as { data: any[] }).data ?? [])]
      const search = u.searchParams.get('search')?.toLowerCase()
      const rarity = u.searchParams.get('rarity')
      const category = u.searchParams.get('category')
      const creator = u.searchParams.get('creator')
      if (ca) items = items.filter(i => String(i.contractAddress).toLowerCase() === ca.toLowerCase())
      if (itemId) items = items.filter(i => String(i.itemId) === itemId)
      if (creator) items = items.filter(i => String(i.creator).toLowerCase() === creator.toLowerCase())
      if (search) items = items.filter(i => String(i.name).toLowerCase().includes(search))
      if (rarity) items = items.filter(i => rarity.split(',').includes(i.rarity))
      if (category) items = items.filter(i => i.category === category)
      if (u.searchParams.get('sortBy') === 'cheapest') items.sort((a, b) => a.priceCredits - b.priceCredits)
      return json(req, { data: items, total: items.length })
    }
    if (path === '/v3/catalog/legacy') {
      // Legacy (classic MANA-priced) liquidity. Honor the same server-side filters.
      let items = [...((F.legacyListings as { data: any[] }).data ?? [])]
      const search = u.searchParams.get('search')?.toLowerCase()
      const rarity = u.searchParams.get('rarity')
      const category = u.searchParams.get('category')
      if (search) items = items.filter(i => String(i.name).toLowerCase().includes(search))
      if (rarity) items = items.filter(i => rarity.split(',').includes(i.rarity))
      if (category) items = items.filter(i => i.category === category)
      if (u.searchParams.get('sortBy') === 'cheapest')
        items.sort((a, b) => Number(BigInt(a.manaWei) - BigInt(b.manaWei)))
      return json(req, { data: items, total: items.length })
    }
    // The home page's TRENDING rail. Served from the same `unifiedListings` fixture as the browse feed, and
    // honouring the two filters the row depends on, because both are what the real endpoint applies in SQL:
    // a mock that ignored `listingType` would put a resale in a rail production never shows one in, and one
    // that ignored `includeSocialEmotes` would hide the fact that the client sends it at all. The RANKING is
    // not reproduced — the fixture has no sales history to rank, and ordering is covered by the server's own
    // tests against a database; what the e2e can observe is which endpoint fills the rail and with what.
    if (path === '/v3/catalog/trending') {
      let items = [...((F.unifiedListings as { data: any[] }).data ?? [])]
      const trendingListingType = u.searchParams.get('listingType')
      if (trendingListingType === 'primary') items = items.filter(i => !i.tokenId)
      if (trendingListingType === 'secondary') items = items.filter(i => !!i.tokenId)
      if (u.searchParams.get('includeSocialEmotes') === 'false') items = items.filter(i => !i.emoteOutcomeType)
      const trendingFirst = Number(u.searchParams.get('first') ?? 0)
      if (Number.isFinite(trendingFirst) && trendingFirst > 0) items = items.slice(0, trendingFirst)
      // Unpaginated: `{ data }` only, no total — same as the real handler.
      return json(req, { data: items })
    }
    if (path === '/v3/catalog/unified') {
      // The ONE browse grid: native + legacy in one feed. `groupBy=item` (the browse grid, fetchShopItems)
      // asks for one row per item carrying listingCount; the default (per-listing, fetchUnified) is served
      // the same way here — the fixtures are already one representative row per item, so no server-side
      // grouping is needed in the mock; any listingCount on a fixture row flows through to the card badge.
      // Honor the same server-side filters so the browse filter/search/sort e2e stay meaningful (native
      // rows sort by priceCredits, legacy by manaWei).
      let items = [...((F.unifiedListings as { data: any[] }).data ?? [])]
      const search = u.searchParams.get('search')?.toLowerCase()
      const rarity = u.searchParams.get('rarity')
      const category = u.searchParams.get('category')
      // Item-scoped reads: the real handler parses both (shop-catalog-handler), and the outfits
      // add-to-cart path resolves ONE item at a time through here. Without them the mock would answer
      // every such lookup with the whole feed, i.e. the wrong listing for every item but the first.
      const unifiedCa = u.searchParams.get('contractAddress')
      const unifiedItemId = u.searchParams.get('itemId')
      if (unifiedCa) items = items.filter(i => String(i.contractAddress).toLowerCase() === unifiedCa.toLowerCase())
      if (unifiedItemId) items = items.filter(i => String(i.itemId) === unifiedItemId)
      if (search) items = items.filter(i => String(i.name).toLowerCase().includes(search))
      if (rarity) items = items.filter(i => rarity.split(',').includes(i.rarity))
      if (category) items = items.filter(i => i.category === category)
      // `listingType` restricts to mints or to resales, and the real server applies it in SQL. Mirrored here
      // because a caller that asks for primaries and silently receives a resale is a difference between the
      // mock and production, not a shortcut: the Overview rails filter this way (they promote creators), and
      // the fixtures do include a secondary row, so ignoring it would quietly put a resale in a rail that
      // production never shows one in. A secondary row is the one with a per-token `tokenId`.
      const listingType = u.searchParams.get('listingType')
      if (listingType === 'primary') items = items.filter(i => !i.tokenId)
      if (listingType === 'secondary') items = items.filter(i => !!i.tokenId)
      // The real handler scopes this feed by creator, and Activity's listing count leans on it to decide
      // whether the migration chip appears at all. Unfiltered, the mock answered "you have listings" for
      // every wallet and the chip could not be tested.
      const unifiedCreator = u.searchParams.get('creator')
      if (unifiedCreator) items = items.filter(i => String(i.creator).toLowerCase() === unifiedCreator.toLowerCase())
      if (u.searchParams.get('sortBy') === 'cheapest') {
        items.sort((a, b) => (a.priceCredits ?? 0) - (b.priceCredits ?? 0))
      }
      // `total` is the unpaginated count (what the real server reports); `first` bounds the page.
      const total = items.length
      const first = Number(u.searchParams.get('first') ?? 0)
      if (Number.isFinite(first) && first > 0) items = items.slice(0, first)
      return json(req, { data: items, total })
    }
    // Collections entity: search dropdown "Collections" section (fetchCollectionSuggestions, ?search=)
    // + the Collection page name lookup (fetchCollection, ?contractAddress=). Honor both filters.
    if (path === '/v1/collections') {
      let rows = (F.collections as { data: any[] }).data ?? []
      const search = u.searchParams.get('search')?.toLowerCase()
      const ca = u.searchParams.get('contractAddress')?.toLowerCase()
      if (ca) rows = rows.filter(c => String(c.contractAddress).toLowerCase() === ca)
      if (search) rows = rows.filter(c => String(c.name).toLowerCase().includes(search))
      return json(req, { data: rows, total: rows.length })
    }
    // Curated contract registry (lib/api.ts → fetchContractRegistry): the Approvals page titles each
    // selling row after the COLLECTION, whose name lives only here. Derived from the same collections
    // fixture so the mock and production agree on what a collection is called. Note the field is
    // `address`, not `contractAddress`.
    if (path === '/v1/contracts') {
      const rows = ((F.collections as { data: any[] }).data ?? []).map(c => ({
        name: c.name,
        address: c.contractAddress,
        category: 'wearable',
        network: 'MATIC',
        chainId: 80002
      }))
      return json(req, { data: rows, total: rows.length })
    }
    // Collection + Creator pages (lib/collections.ts → fetchCollectionItems/fetchCreatorItems).
    // Returns the collection's CATALOG items with server-computed priceCredits, filtered by the
    // contractAddress / creator query param.
    if (path === '/v3/catalog/items' || path === '/v1/items') {
      const ca = u.searchParams.get('contractAddress')
      const creator = u.searchParams.get('creator')
      // itemId matters on the item route: fetchItemMeta asks for ONE item, and answering with the whole
      // collection handed it the first row's traits — a different item's isSmart / utility.
      const itemsItemId = u.searchParams.get('itemId')
      let rows = ((F.shopListings as { data: any[] }).data ?? []).map(toCatalogRow)
      if (ca) rows = rows.filter(r => String(r.contractAddress).toLowerCase() === ca.toLowerCase())
      if (itemsItemId) rows = rows.filter(r => String(r.itemId) === itemsItemId)
      if (creator) rows = rows.filter(r => String(r.creator).toLowerCase() === creator.toLowerCase())
      // The browse filters, honored exactly as the other feeds honor them. `search` matches a substring
      // of the NAME — the same rule /v3/catalog/unified applies, so the "All"/"Not for Sale" grid and
      // the on-sale grid agree on what a query matches. Every fixture row is priced, hence on sale.
      const catalogSearch = u.searchParams.get('search')?.toLowerCase()
      const catalogRarity = u.searchParams.get('rarity')
      const catalogCategory = u.searchParams.get('category')
      const isOnSale = u.searchParams.get('isOnSale')
      if (catalogSearch) rows = rows.filter(r => String(r.name).toLowerCase().includes(catalogSearch))
      if (catalogRarity) rows = rows.filter(r => catalogRarity.split(',').includes(r.rarity))
      if (catalogCategory) rows = rows.filter(r => r.category === catalogCategory)
      if (isOnSale === 'false') rows = []
      return json(req, { data: rows, total: rows.length })
    }
    if (path === '/v1/nfts') {
      // Creator search step 1 (lib/search.ts → fetchNameOwners): DCL names matching ?search=.
      if (u.searchParams.get('category') === 'ens') {
        let names = (F.creatorNames as { data: any[] }).data ?? []
        const search = u.searchParams.get('search')?.toLowerCase()
        if (search) names = names.filter(n => String(n.nft.name).toLowerCase().includes(search))
        return json(req, { data: names, total: names.length })
      }
      // Owner-scoped (?owner=) vs PUBLIC token lookup (?contractAddress=&tokenId=) are different
      // questions: a buyer owns nothing yet the token still exists. Answering both from one fixture made
      // the non-owner path untestable — the viewer always looked like the owner.
      const tokenId = u.searchParams.get('tokenId')
      if (!u.searchParams.get('owner') && tokenId) {
        const rows = ((F.publicNfts ?? F.ownedNfts) as { data: any[] }).data ?? []
        const match = rows.filter(r => String(r.nft?.tokenId) === tokenId)
        return json(req, { data: match, total: match.length })
      }
      return json(req, F.ownedNfts)
    }
    // Creator search step 2 (lib/search.ts → fetchSellerCounts): collection counts per address.
    if (path === '/v1/accounts') {
      const wanted = u.searchParams.getAll('address').map(a => a.toLowerCase())
      let rows = (F.accounts as { data: any[] }).data ?? []
      if (wanted.length) rows = rows.filter(a => wanted.includes(String(a.address).toLowerCase()))
      return json(req, { data: rows, total: rows.length })
    }
    if (path === '/v1/trades' && method === 'POST') return json(req, { ok: true, data: { id: 'new-trade' } }, 201)
    if (/\/v1\/trades\/.+/.test(path)) return json(req, { ok: true, data: F.trade })
    // Secondary sales feed (Activity page → fetchUserSales, ?seller=/?buyer=). Return the fixture data
    // as-is (the address filter is applied server-side in prod; the fixture is already scoped per run).
    if (path === '/v1/sales') return json(req, F.sales)
    // Creator rankings (lib/rankings.ts → fetchTopCreators). Served from a fixture so a spec can put
    // creators on the row: without one this fell through to the empty `{ data: [] }` below, i.e. the
    // section rendered its skeletons and then removed itself.
    if (path.startsWith('/v1/rankings/')) return json(req, F.rankings)
    if (path === '/v1/orders') return json(req, { data: [], total: 0 })
    // Favorites service (marketplace picks): POST toggles membership in the run's accumulator; the
    // default-list GET returns the picked ids in the {ok, data} envelope lib/favorites.ts parses.
    if (/^\/v1\/picks\/[^/]+$/.test(path) && method === 'POST') {
      const itemId = path.split('/').pop() as string
      const body: { pickedFor?: string[]; unpickedFrom?: string[] } = JSON.parse(req.postData() ?? '{}')
      if (body.pickedFor) favoritePicks = [itemId, ...favoritePicks.filter(i => i !== itemId)]
      if (body.unpickedFrom) favoritePicks = favoritePicks.filter(i => i !== itemId)
      return json(req, { ok: true, data: { pickedByUser: !!body.pickedFor } })
    }
    if (/^\/v1\/lists\/[^/]+\/picks$/.test(path)) {
      const results = favoritePicks.map(itemId => ({ itemId, createdAt: Date.now() }))
      return json(req, {
        ok: true,
        data: { results, total: results.length, page: 1, pages: 1, limit: 100 }
      })
    }
    if (path === '/v2/catalog') {
      // ?id= hydration (fetchCatalogByIds — the favorites page): serve the matching shop listings
      // as catalog rows. Plain browse reads of /v2/catalog stay empty (the app browses /v3).
      const ids = u.searchParams.getAll('id').map(id => id.toLowerCase())
      if (ids.length) {
        const rows = ((F.shopListings as { data: any[] }).data ?? [])
          .map(toCatalogRow)
          .filter(r => ids.includes(String(r.id).toLowerCase()))
        return json(req, { data: rows, total: rows.length })
      }
      return json(req, { data: [], total: 0 })
    }
    return json(req, { data: [] })
  }

  // DCL push-notifications service (signed-fetch). GET lists them, PUT marks them read.
  if (u.hostname.includes('notifications.decentraland')) {
    if (path === '/notifications/read') return json(req, { ok: true })
    if (path === '/notifications') return json(req, F.notifications)
    return json(req, {})
  }

  // builder-server
  if (u.hostname.includes('builder-api')) {
    if (/\/v1\/collections\/.+\/items/.test(path)) return json(req, F.builderItems)
    if (/\/v1\/.+\/collections/.test(path)) return json(req, F.builderCollections)
    if (/\/v1\/items\/.+\/contents$/.test(path)) return json(req, { data: F.builderItemContents })
    return json(req, { data: [] })
  }

  // peer lambdas (profiles) + content (store entity)
  if (u.hostname.includes('peer.decentraland')) {
    // Creator store entity (cover + description) for the storefront hero. The fixture creator gets a
    // store with a description; everyone else resolves to no entity (hero uses the default cover).
    if (path === '/content/entities/active') {
      const body = JSON.parse(req.postData() || '{}') as { pointers?: string[] }
      const isCreator = (body.pointers ?? []).some(p => p.toLowerCase().includes(fx.CREATOR_ADDRESS.toLowerCase()))
      if (isCreator) {
        return json(req, [
          {
            content: [{ file: 'cover/cover.jpg', hash: 'QmCover' }],
            metadata: {
              description: 'Handcrafted wearables & emotes.',
              images: [{ name: 'cover', file: 'cover/cover.jpg' }],
              links: [
                { name: 'website', url: 'https://galaxy.example' },
                { name: 'twitter', url: 'https://www.twitter.com/galaxy' },
                { name: 'discord', url: 'https://discord.gg/galaxy' }
              ]
            }
          }
        ])
      }
      // Any other pointer is the signed-in user's own store: serve the per-run fixture if provided.
      return json(req, F.userStore ? [F.userStore] : [])
    }
    // Store entity deployment (store-settings save). Before POSTing the entity the catalyst client
    // GETs /available-content to skip re-uploading known hashes — return "nothing uploaded yet" so it
    // uploads, then ack the POST /content/entities deploy so the app's success path runs.
    if (path === '/content/available-content') {
      const cids = u.searchParams.getAll('cid')
      return json(
        req,
        cids.map(cid => ({ cid, available: false }))
      )
    }
    if (path === '/content/entities' && method === 'POST') {
      return json(req, { creationTimestamp: 1 })
    }
    if (path.includes('/lambdas/profiles')) {
      // The fixture creator (author of the shop listings + the matched DCL name) resolves to a
      // "Galaxy Studio" profile — used for the "By {creator}" sublines and the Creators row name.
      // Every other address (incl. the signed-in user) gets the default F.profile.
      const isCreator = path.toLowerCase().includes(fx.CREATOR_ADDRESS.toLowerCase())
      const body = isCreator
        ? { avatars: [{ name: 'Galaxy Studio', userId: fx.CREATOR_ADDRESS, avatar: { snapshots: { face256: '' } } }] }
        : F.profile
      return json(req, method === 'POST' ? [body] : body)
    }
    return req.respond({ status: 200, headers: { 'content-type': 'image/png', ...CORS }, body: PNG })
  }

  // External scripts/styles → an EMPTY module with the CORRECT MIME type. The shared DCL navbar/footer
  // bundle (cdn.decentraland.org/@dcl/sites/…) is pulled by the page shell, and the JSON fallback below
  // made the browser refuse it ("Expected a JavaScript-or-Wasm module script"). On a hard load of a route
  // whose shell fetches it, that left the whole page BLANK — a harness artefact that looks exactly like an
  // app crash. Empty is fine: the shop renders its own navbar; the CDN bundle only decorates the shell.
  if (/\.(m?js|css)$/.test(path)) {
    const type = path.endsWith('.css') ? 'text/css' : 'application/javascript'
    return req.respond({ status: 200, headers: { 'content-type': type, ...CORS }, body: '' })
  }

  // Anything else external → empty (and log, so we notice a missing mock).
  // eslint-disable-next-line no-console
  console.warn('[e2e] unmocked request:', method, req.url())
  return json(req, { data: [] })
}

export type App = { browser: Browser; page: Page; close: () => Promise<void> }

/**
 * Per-response delays, keyed by a URL pathname SUBSTRING (e.g. `{ '/v1/outfits': 800 }`).
 *
 * Exists for the layout-stability specs: every mock here answers in under a millisecond, so all of a
 * page's sections land in the same frame and the page never passes through the half-loaded state a real
 * visitor sees. Staggering the feeds is what makes "does this section reserve its height" observable.
 */
export type Delays = Record<string, number>

function delayFor(path: string, delays: Delays): number {
  let ms = 0
  for (const [match, value] of Object.entries(delays)) {
    if (path.includes(match)) ms = Math.max(ms, value)
  }
  return ms
}

/**
 * Launch a headless page with the mock wallet + all network mocked, navigated to `path`.
 * Options (all default-off so existing specs are unaffected):
 * - signedOut: skip the session init script so the app renders signed-out (no wallet, no identity).
 * - errors: per-run forced error responses keyed by URL pathname (e.g. { '/credits/authorize': { status: 402 } }).
 */
export async function launchApp(
  opts: {
    path?: string
    fixtures?: Partial<Fixtures>
    signedOut?: boolean
    errors?: ErrorMap
    /** MANA (wei, as a decimal string) the mocked ERC20 reports — drives the MANA payment rails. */
    manaBalanceWei?: string
    /** MANA allowance the mocked ERC20 reports; omit for "already approved". */
    manaAllowanceWei?: string
    /**
     * Whether the mocked flag file reports secondary sales as available. Defaults to TRUE so the resale
     * specs cover the feature; pass false to exercise the shipped default, where the Shop offers none.
     */
    secondarySales?: boolean
    /**
     * Arm the shop-outfit-creators flag with the test user's address in the variant, so the outfit
     * studio surfaces render (outfits.e2e.ts). Off by default — everyone else sees no studio.
     */
    outfitCreator?: boolean
    /**
     * App origin override for specs that boot their own dev server (outfits.e2e.ts needs a build
     * with a shop-server host configured). Defaults to the shared BASE server.
     */
    base?: string
    /**
     * Whether the mocked flag file reports creator follows as available. Defaults to FALSE — the shipped
     * state, where the feature is hidden; the follows spec passes true to exercise the prototype.
     */
    follows?: boolean
    /** Per-pathname response delays (see {@link Delays}) — for the layout-stability specs. */
    delays?: Delays
    /**
     * Script evaluated on every new document BEFORE anything renders — the only place a spec can
     * install a first-paint recorder (a PerformanceObserver, an rAF sampler) early enough to see it.
     */
    initScript?: string
    /**
     * What `page.goto` waits for. Defaults to `networkidle2` (every spec asserting settled content);
     * a layout spec passes `domcontentloaded` so it can observe the page while it is still filling in.
     */
    waitUntil?: 'load' | 'domcontentloaded' | 'networkidle0' | 'networkidle2'
  } = {}
): Promise<App> {
  const F = { ...defaults(), ...opts.fixtures }
  const errors = opts.errors ?? {}
  const appBase = opts.base ?? BASE
  secondarySalesFlag = opts.secondarySales ?? true
  outfitCreatorFlag = opts.outfitCreator ?? false
  outfitStore = structuredClone(((F.outfits as { outfits?: any[] })?.outfits ?? []) as any[])
  followsFlag = opts.follows ?? false
  mintedCents = 0 // reset the per-run top-up accumulator so balances don't leak between tests
  favoritePicks = [] // reset the per-run picks so favorites don't leak between tests
  setManaBalanceWei(opts.manaBalanceWei ?? '0') // no MANA unless a test asks for it
  setManaAllowanceWei(opts.manaAllowanceWei ?? null) // already approved unless a test asks otherwise
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] })
  const page = await browser.newPage()
  // Default to a desktop viewport so the browse sidebar (Category/Price/Rarity) renders inline; below
  // 900px it collapses into the mobile Filters drawer. Mobile-specific tests can override per-page.
  await page.setViewport({ width: 1280, height: 900 })
  // Only inject the signed-in session (localStorage identity + mock window.ethereum) when NOT signedOut.
  if (!opts.signedOut) {
    const sess = await session()
    await page.evaluateOnNewDocument(sessionInitScript(sess))
  }
  if (opts.initScript) await page.evaluateOnNewDocument(opts.initScript)
  await page.setRequestInterception(true)
  const delays = opts.delays ?? {}
  page.on('request', req => {
    const respond = () => {
      try {
        route(req, F, errors, appBase)
      } catch (e) {
        if (!req.response()) req.respond({ status: 500, headers: CORS, body: String(e) }).catch(() => {})
      }
    }
    const ms = delayFor(new URL(req.url()).pathname, delays)
    if (ms > 0) setTimeout(respond, ms)
    else respond()
  })
  await page.goto(`${appBase}${opts.path ?? '/'}`, { waitUntil: opts.waitUntil ?? 'networkidle2', timeout: 45000 })
  return { browser, page, close: () => browser.close() }
}
