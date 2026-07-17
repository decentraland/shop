// Installs the git hooks defined in the repo-root `.simple-git-hooks.json`.
//
// simple-git-hooks writes to `<cwd>/.git/hooks`, but this app's package.json
// lives one level below the git root (`app/`), so we must run it from the root.
// Run automatically via the `prepare` script on `npm install`.
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = resolve(appDir, '..')

try {
  const { setHooksFromConfig } = require('simple-git-hooks')
  await setHooksFromConfig(repoRoot)
} catch (error) {
  // Never fail an install because hooks couldn't be set (e.g. no .git in CI).
  console.warn(`[install-git-hooks] Skipped: ${error.message}`)
}
