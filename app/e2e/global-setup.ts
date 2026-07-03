import { spawn, type ChildProcess } from 'node:child_process'
import { resolve } from 'node:path'

// Starts a dedicated dev server for the e2e run (port 5273, separate from the human's :5174) and
// tears it down after. All the app's network calls are mocked per-page, so this server only serves
// the built app assets.
const PORT = 5273
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
    env: { ...process.env }
  })
  await waitForServer()
}

export async function teardown() {
  if (child && !child.killed) child.kill('SIGTERM')
}
