import puppeteer, { type Browser, type HTTPRequest, type Page } from 'puppeteer'
import { buildTestSession, sessionInitScript, type TestSession } from './session'
import { handleRpc } from './rpc'
import * as fx from '../fixtures'

export const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:5273'

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
  ownedNfts: unknown
  builderCollections: unknown
  builderItems: unknown
  profile: unknown
  authorize: unknown
  trade: unknown
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
    ownedNfts: fx.ownedNfts,
    builderCollections: fx.builderCollections,
    builderItems: fx.builderItems,
    profile: fx.profile,
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
    trade: null
  }
}

let sessionPromise: Promise<TestSession> | null = null
function session(): Promise<TestSession> {
  if (!sessionPromise) sessionPromise = buildTestSession()
  return sessionPromise
}

function json(req: HTTPRequest, obj: unknown, status = 200) {
  return req.respond({ status, headers: { 'content-type': 'application/json', ...CORS }, body: JSON.stringify(obj) })
}

// A forced error response, keyed by URL pathname (opt-in per run via launchApp({ errors })).
type ErrorMap = Record<string, { status: number; body?: unknown }>

// Map a shop listing (fixtures shape) → a catalog item the /v3/catalog/items endpoint returns
// (the shape lib/collections.ts's toCatalogItem reads). The server computes `priceCredits` per item;
// `price` (USD wei, 1e18 = $1) is kept for shape parity with /v1/items.
function toCatalogRow(l: any) {
  const priceCredits = Math.max(1, Math.round(l.priceCredits ?? 1))
  const priceWei = String(BigInt(priceCredits) * 10n ** 17n) // credits × $0.10 in wei
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
    price: priceWei,
    priceCredits
  }
}

function route(req: HTTPRequest, F: Fixtures, errors: ErrorMap = {}) {
  const u = new URL(req.url())
  const method = req.method()
  const path = u.pathname

  // Same-origin app assets (vite) + inline data: URIs → let through.
  if (u.port === '5273' || req.url().startsWith('data:')) return req.continue()
  // CORS preflight must always succeed (204) — even for a forced-error path below — so the browser
  // actually issues the real request (otherwise a preflight failure masks the intended error as a
  // generic "Failed to fetch"). The error is returned WITH CORS headers on the real request.
  if (method === 'OPTIONS') return req.respond({ status: 204, headers: CORS })
  // Forced error injection (opt-in): before the normal per-port handling, respond with the mapped
  // status+body (json() attaches CORS headers, so the error reaches the app instead of being blocked).
  if (errors[path]) return json(req, errors[path].body ?? { error: 'forced' }, errors[path].status)
  // Web fonts → empty stylesheet (no external hit; system font falls back, same as the app).
  if (u.hostname.includes('fonts.google') || u.hostname.includes('gstatic')) {
    return req.respond({ status: 200, headers: { 'content-type': 'text/css', ...CORS }, body: '' })
  }

  // JSON-RPC read provider.
  if (u.hostname.includes('rpc-amoy') || u.hostname.includes('rpc.decentraland')) {
    return req.respond({ status: 200, headers: { 'content-type': 'application/json', ...CORS }, body: handleRpc(req.postData() || '{}') })
  }
  // Meta-transaction relayer (transactions-server): gasless checkout POSTs the signed useCredits
  // meta-tx here; the RPC mock then returns a status-1 receipt for the returned hash. Gasless is the
  // default checkout path, so the credit-buy flows exercise this.
  if (u.hostname.includes('transactions-api') && path.endsWith('/transactions')) {
    return json(req, { ok: true, txHash: '0x' + 'ab'.repeat(32) })
  }
  // WearablePreview iframe → blank page (don't hit the external preview app).
  if (u.hostname.includes('wearable-preview')) {
    return req.respond({ status: 200, headers: { 'content-type': 'text/html', ...CORS }, body: '<!doctype html><title>preview</title>' })
  }
  // Images / builder content.
  if (path.includes('/contents/') || /\.(png|jpe?g|gif|svg|webp|ico)$/.test(path)) {
    return req.respond({ status: 200, headers: { 'content-type': 'image/png', ...CORS }, body: PNG })
  }

  // credits-server (:3000)
  if (u.port === '3000') {
    if (/\/users\/.+\/credits$/.test(path)) return json(req, F.credits)
    if (/\/users\/.+\/purchases$/.test(path)) return json(req, { purchases: [] })
    if (path === '/credits/authorize') return json(req, F.authorize)
    if (path === '/credits/authorize/cancel') return json(req, { released: 0 })
    if (path === '/dev/mint-usd') return json(req, { id: 'x', usdCents: 1000, balanceCents: 6000, credits: 600 })
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
      if (ca) items = items.filter(i => String(i.contractAddress).toLowerCase() === ca.toLowerCase())
      if (itemId) items = items.filter(i => String(i.itemId) === itemId)
      if (search) items = items.filter(i => String(i.name).toLowerCase().includes(search))
      if (rarity) items = items.filter(i => rarity.split(',').includes(i.rarity))
      if (category) items = items.filter(i => i.category === category)
      if (u.searchParams.get('sortBy') === 'cheapest') items.sort((a, b) => a.priceCredits - b.priceCredits)
      return json(req, { data: items, total: items.length })
    }
    if (path === '/v3/catalog/legacy') {
      // Legacy (classic MANA-priced) liquidity for the Market tab. Honor the same server-side filters.
      let items = [...((F.legacyListings as { data: any[] }).data ?? [])]
      const search = u.searchParams.get('search')?.toLowerCase()
      const rarity = u.searchParams.get('rarity')
      const category = u.searchParams.get('category')
      if (search) items = items.filter(i => String(i.name).toLowerCase().includes(search))
      if (rarity) items = items.filter(i => rarity.split(',').includes(i.rarity))
      if (category) items = items.filter(i => i.category === category)
      if (u.searchParams.get('sortBy') === 'cheapest') items.sort((a, b) => Number(BigInt(a.manaWei) - BigInt(b.manaWei)))
      return json(req, { data: items, total: items.length })
    }
    // Collections entity: search dropdown "Collections" section (fetchCollectionSuggestions, ?search=)
    // + the Collection page name lookup (fetchCollection, ?contractAddress=). Honor both filters.
    if (path === '/v1/collections') {
      let rows = ((F.collections as { data: any[] }).data ?? [])
      const search = u.searchParams.get('search')?.toLowerCase()
      const ca = u.searchParams.get('contractAddress')?.toLowerCase()
      if (ca) rows = rows.filter(c => String(c.contractAddress).toLowerCase() === ca)
      if (search) rows = rows.filter(c => String(c.name).toLowerCase().includes(search))
      return json(req, { data: rows, total: rows.length })
    }
    // Collection + Creator pages (lib/collections.ts → fetchCollectionItems/fetchCreatorItems).
    // Returns the collection's CATALOG items with server-computed priceCredits, filtered by the
    // contractAddress / creator query param.
    if (path === '/v3/catalog/items' || path === '/v1/items') {
      const ca = u.searchParams.get('contractAddress')
      const creator = u.searchParams.get('creator')
      let rows = ((F.shopListings as { data: any[] }).data ?? []).map(toCatalogRow)
      if (ca) rows = rows.filter(r => String(r.contractAddress).toLowerCase() === ca.toLowerCase())
      if (creator) rows = rows.filter(r => String(r.creator).toLowerCase() === creator.toLowerCase())
      return json(req, { data: rows })
    }
    if (path === '/v1/nfts') {
      // Creator search step 1 (lib/search.ts → fetchNameOwners): DCL names matching ?search=.
      if (u.searchParams.get('category') === 'ens') {
        let names = ((F.creatorNames as { data: any[] }).data ?? [])
        const search = u.searchParams.get('search')?.toLowerCase()
        if (search) names = names.filter(n => String(n.nft.name).toLowerCase().includes(search))
        return json(req, { data: names, total: names.length })
      }
      return json(req, F.ownedNfts)
    }
    // Creator search step 2 (lib/search.ts → fetchSellerCounts): collection counts per address.
    if (path === '/v1/accounts') {
      const wanted = u.searchParams.getAll('address').map(a => a.toLowerCase())
      let rows = ((F.accounts as { data: any[] }).data ?? [])
      if (wanted.length) rows = rows.filter(a => wanted.includes(String(a.address).toLowerCase()))
      return json(req, { data: rows, total: rows.length })
    }
    if (path === '/v1/trades' && method === 'POST') return json(req, { ok: true, data: { id: 'new-trade' } }, 201)
    if (/\/v1\/trades\/.+/.test(path)) return json(req, { ok: true, data: F.trade })
    if (path === '/v1/orders') return json(req, { data: [], total: 0 })
    if (path === '/v2/catalog') return json(req, { data: [], total: 0 })
    return json(req, { data: [] })
  }

  // builder-server
  if (u.hostname.includes('builder-api')) {
    if (/\/v1\/collections\/.+\/items/.test(path)) return json(req, F.builderItems)
    if (/\/v1\/.+\/collections/.test(path)) return json(req, F.builderCollections)
    if (/\/v1\/items\/.+\/contents$/.test(path)) return json(req, { data: { 'thumbnail.png': 'bafyfake' } })
    return json(req, { data: [] })
  }

  // peer lambdas (profiles)
  if (u.hostname.includes('peer.decentraland')) {
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

  // Anything else external → empty (and log, so we notice a missing mock).
  // eslint-disable-next-line no-console
  console.warn('[e2e] unmocked request:', method, req.url())
  return json(req, { data: [] })
}

export type App = { browser: Browser; page: Page; close: () => Promise<void> }

/**
 * Launch a headless page with the mock wallet + all network mocked, navigated to `path`.
 * Options (all default-off so existing specs are unaffected):
 * - signedOut: skip the session init script so the app renders signed-out (no wallet, no identity).
 * - errors: per-run forced error responses keyed by URL pathname (e.g. { '/credits/authorize': { status: 402 } }).
 */
export async function launchApp(
  opts: { path?: string; fixtures?: Partial<Fixtures>; signedOut?: boolean; errors?: ErrorMap } = {}
): Promise<App> {
  const F = { ...defaults(), ...opts.fixtures }
  const errors = opts.errors ?? {}
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] })
  const page = await browser.newPage()
  // Only inject the signed-in session (localStorage identity + mock window.ethereum) when NOT signedOut.
  if (!opts.signedOut) {
    const sess = await session()
    await page.evaluateOnNewDocument(sessionInitScript(sess))
  }
  await page.setRequestInterception(true)
  page.on('request', req => {
    try {
      route(req, F, errors)
    } catch (e) {
      if (!req.response()) req.respond({ status: 500, headers: CORS, body: String(e) }).catch(() => {})
    }
  })
  await page.goto(`${BASE}${opts.path ?? '/'}`, { waitUntil: 'networkidle2', timeout: 45000 })
  return { browser, page, close: () => browser.close() }
}
