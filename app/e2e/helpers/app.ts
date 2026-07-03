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

function route(req: HTTPRequest, F: Fixtures) {
  const u = new URL(req.url())
  const method = req.method()
  const path = u.pathname

  // Same-origin app assets (vite) + inline data: URIs → let through.
  if (u.port === '5273' || req.url().startsWith('data:')) return req.continue()
  if (method === 'OPTIONS') return req.respond({ status: 204, headers: CORS })
  // Web fonts → empty stylesheet (no external hit; system font falls back, same as the app).
  if (u.hostname.includes('fonts.google') || u.hostname.includes('gstatic')) {
    return req.respond({ status: 200, headers: { 'content-type': 'text/css', ...CORS }, body: '' })
  }

  // JSON-RPC read provider.
  if (u.hostname.includes('rpc-amoy') || u.hostname.includes('rpc.decentraland')) {
    return req.respond({ status: 200, headers: { 'content-type': 'application/json', ...CORS }, body: handleRpc(req.postData() || '{}') })
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
    if (path === '/v1/nfts') return json(req, F.ownedNfts)
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
    if (path.includes('/lambdas/profiles')) return json(req, method === 'POST' ? [F.profile] : F.profile)
    return req.respond({ status: 200, headers: { 'content-type': 'image/png', ...CORS }, body: PNG })
  }

  // Anything else external → empty (and log, so we notice a missing mock).
  // eslint-disable-next-line no-console
  console.warn('[e2e] unmocked request:', method, req.url())
  return json(req, { data: [] })
}

export type App = { browser: Browser; page: Page; close: () => Promise<void> }

/** Launch a headless page with the mock wallet + all network mocked, navigated to `path`. */
export async function launchApp(opts: { path?: string; fixtures?: Partial<Fixtures> } = {}): Promise<App> {
  const F = { ...defaults(), ...opts.fixtures }
  const sess = await session()
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] })
  const page = await browser.newPage()
  await page.evaluateOnNewDocument(sessionInitScript(sess))
  await page.setRequestInterception(true)
  page.on('request', req => {
    try {
      route(req, F)
    } catch (e) {
      if (!req.response()) req.respond({ status: 500, headers: CORS, body: String(e) }).catch(() => {})
    }
  })
  await page.goto(`${BASE}${opts.path ?? '/'}`, { waitUntil: 'networkidle2', timeout: 45000 })
  return { browser, page, close: () => browser.close() }
}
