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
  unifiedListings: unknown
  ownedNfts: unknown
  builderCollections: unknown
  builderItems: unknown
  profile: unknown
  authorize: unknown
  trade: unknown
  userStore: unknown
  purchases: unknown
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
    builderCollections: fx.builderCollections,
    builderItems: fx.builderItems,
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
    purchases: { purchases: [] }
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

  // Same-origin app assets (vite dev server, whatever port BASE resolves to) + inline data: URIs →
  // let through. Deriving the port from BASE (not a hardcoded 5273) keeps the mock working when the
  // e2e server runs on a custom E2E_PORT.
  if (u.port === new URL(BASE).port || req.url().startsWith('data:')) return req.continue()
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
  // WearablePreview iframe → blank page (don't hit the external preview app).
  if (u.hostname.includes('wearable-preview')) {
    return req.respond({
      status: 200,
      headers: { 'content-type': 'text/html', ...CORS },
      body: '<!doctype html><title>preview</title>'
    })
  }
  // Images / builder content.
  if (path.includes('/contents/') || /\.(png|jpe?g|gif|svg|webp|ico)$/.test(path)) {
    return req.respond({ status: 200, headers: { 'content-type': 'image/png', ...CORS }, body: PNG })
  }

  // credits-server (:3000)
  if (u.port === '3000') {
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
    if (path === '/v3/catalog/unified') {
      // The ONE browse grid: native + legacy in one feed. Honor the same server-side filters so the
      // browse filter/search/sort e2e stay meaningful (native rows sort by priceCredits, legacy by manaWei).
      let items = [...((F.unifiedListings as { data: any[] }).data ?? [])]
      const search = u.searchParams.get('search')?.toLowerCase()
      const rarity = u.searchParams.get('rarity')
      const category = u.searchParams.get('category')
      if (search) items = items.filter(i => String(i.name).toLowerCase().includes(search))
      if (rarity) items = items.filter(i => rarity.split(',').includes(i.rarity))
      if (category) items = items.filter(i => i.category === category)
      if (u.searchParams.get('sortBy') === 'cheapest') {
        items.sort((a, b) => (a.priceCredits ?? 0) - (b.priceCredits ?? 0))
      }
      return json(req, { data: items, total: items.length })
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
        let names = (F.creatorNames as { data: any[] }).data ?? []
        const search = u.searchParams.get('search')?.toLowerCase()
        if (search) names = names.filter(n => String(n.nft.name).toLowerCase().includes(search))
        return json(req, { data: names, total: names.length })
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
  mintedCents = 0 // reset the per-run top-up accumulator so balances don't leak between tests
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
