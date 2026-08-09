/**
 * Stub credits-server for eyeballing the held-credits UI without a chain, a squid or a wallet.
 *
 * Serves only what the navbar badge and the buy modal read, with the `held` block driven by a CASE
 * argument. It ignores signed-fetch auth entirely — it exists to render states, not to be a server.
 *
 *   node scripts/mock-credits-server.mjs frozen
 *   VITE_CREDITS_SERVER_URL=http://localhost:5555 npm run dev
 *
 * Cases:
 *   none      nothing held — the badge must not render at all
 *   counting  held with a live estimate — the countdown state
 *   frozen    held with NO estimate (releasesAtSeconds: null) — the squid cannot vouch yet
 *   expiring  estimate 20s out, so you can watch it run down and flip to the no-estimate copy
 *   short     nothing held, balance below the price — the plain insufficient-funds screen
 *   shortheld held AND short — the case that made a buyer think we took her credits
 */
import { createServer } from 'node:http'

const CASE = process.argv[2] ?? 'frozen'
const PORT = Number(process.env.PORT ?? 5555)
const now = () => Math.floor(Date.now() / 1000)

// 1 credit = 10 cents, everywhere.
const heldBlock = (credits, releasesInSeconds) => ({
  cents: credits * 10,
  credits,
  releasesAtSeconds: releasesInSeconds === null ? null : now() + releasesInSeconds,
  purchases: [
    {
      credits,
      releasesAtSeconds: releasesInSeconds === null ? null : now() + releasesInSeconds,
      contractAddress: '0xd86c96e8e9d0e0f1f8e7f6a5b4c3d2e1f0a9b8c7',
      itemId: '1'
    }
  ]
})

const CASES = {
  none: () => ({ balanceCents: 2260, credits: 226 }),
  counting: () => ({ balanceCents: 2260, credits: 226, held: heldBlock(3, 240) }),
  frozen: () => ({ balanceCents: 2260, credits: 226, held: heldBlock(3, null) }),
  expiring: () => ({ balanceCents: 2260, credits: 226, held: heldBlock(3, 20) }),
  short: () => ({ balanceCents: 20, credits: 2 }),
  shortheld: () => ({ balanceCents: 20, credits: 2, held: heldBlock(3, null) })
}

if (!CASES[CASE]) {
  console.error(`Unknown case "${CASE}". One of: ${Object.keys(CASES).join(', ')}`)
  process.exit(1)
}

createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  if (req.method === 'OPTIONS') return res.writeHead(204).end()

  const path = new URL(req.url, 'http://x').pathname
  const send = body => {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify(body))
  }

  if (path.endsWith('/credits') && path.startsWith('/users/')) {
    // Recomputed per request so the countdown actually moves between polls.
    return send({ credits: [], totalCredits: 0, totals: { expiring: 0, nonExpiring: 0 }, usd: CASES[CASE]() })
  }
  if (path.endsWith('/purchases')) return send({ items: [], total: 0 })

  console.log(`[mock] unhandled ${req.method} ${path}`)
  res.writeHead(404, { 'content-type': 'application/json' })
  res.end(JSON.stringify({ error: 'not mocked' }))
}).listen(PORT, () => {
  console.log(`[mock] credits-server stub on http://localhost:${PORT} serving case "${CASE}"`)
  console.log(`[mock] usd = ${JSON.stringify(CASES[CASE]())}`)
})
