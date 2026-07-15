import { spawn, type ChildProcess } from 'node:child_process'
import { resolve } from 'node:path'

// Starts a dedicated dev server for the e2e run (port 5273, separate from the human's :5174) and
// tears it down after. All the app's network calls are mocked per-page, so this server only serves
// the built app assets.
// Port is env-configurable so multiple e2e runs (e.g. parallel agents) don't clash on one port; pair
// with E2E_BASE_URL=http://localhost:<same-port> so launchApp targets the right server.
const PORT = Number(process.env.E2E_PORT ?? 5273)
const URL = `http://localhost:${PORT}/`
let child: ChildProcess | undefined

async function waitForServer(timeoutMs = 90000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(URL)
      if (res.ok) return
    } catch {
      // not up yet
    }
    await new Promise(r => setTimeout(r, 500))
  }
  throw new Error(`e2e dev server did not start on ${URL} within ${timeoutMs}ms`)
}

export async function setup() {
  const vite = resolve(process.cwd(), 'node_modules/.bin/vite')
  child = spawn(vite, ['--port', String(PORT), '--strictPort'], {
    cwd: process.cwd(),
    stdio: 'ignore',
    // Point the app at the localhost hosts the per-page request mock intercepts (helpers/app.ts
    // routes credits by :3000 and marketplace/nft by :5003). These VITE_* overrides win over the
    // per-env JSON (see src/config) so the e2e build is hermetic regardless of the resolved env.
    env: {
      ...process.env,
      VITE_MARKETPLACE_SERVER_URL: 'http://localhost:5003',
      VITE_NFT_API_URL: 'http://localhost:5003',
      VITE_CREDITS_SERVER_URL: 'http://localhost:3000'
    }
  })
  await waitForServer()
}

export async function teardown() {
  if (child && !child.killed) child.kill('SIGTERM')
}
