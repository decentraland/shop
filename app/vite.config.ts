import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import { fileURLToPath, URL } from 'node:url'
import { readFileSync, writeFileSync } from 'node:fs'

// Build/dev config. Points at a LOCAL marketplace-server by default (see .env / config.ts).
// DCL libs (connect/dapps/crypto) need Node globals (Buffer/global/process) in the browser.
// Test config lives in vitest.config.ts.

const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf8'))

// DCL sites are served from the versioned CDN path (cdn.decentraland.org/<name>/<version>/), so the
// deploy build must reference assets there. Gated on DEPLOY_CDN (set only by the deploy workflows) so
// local dev + the e2e dev server + the CI build-check keep serving from the root.
const base = process.env.DEPLOY_CDN === 'true' ? `https://cdn.decentraland.org/${pkg.name}/${pkg.version}/` : '/'

// The app package.json is `private` and vite doesn't copy it, so emit a publishable package.json into
// dist. That's the manifest npm/oddish publishes; the CDN serves this package at <name>/<version>/.
function emitPackageJson() {
  return {
    name: 'emit-package-json',
    closeBundle() {
      const out = {
        name: pkg.name,
        version: pkg.version,
        main: 'index.js',
        author: 'Decentraland',
        license: 'Apache-2.0',
        repository: { type: 'git', url: 'git+https://github.com/decentraland/shop.git' }
      }
      writeFileSync(fileURLToPath(new URL('./dist/package.json', import.meta.url)), `${JSON.stringify(out, null, 2)}\n`)
    }
  }
}

export default defineConfig({
  base,
  plugins: [react(), nodePolyfills({ globals: { Buffer: true, global: true, process: true } }), emitPackageJson()],
  resolve: {
    alias: [
      { find: '~', replacement: fileURLToPath(new URL('./src', import.meta.url)) },
      // Cross-chain SDK we don't use; stub it so decentraland-transactions bundles without it.
      // Anchored regexes so the /dist/types subpath doesn't get mangled by prefix matching.
      { find: /^@0xsquid\/sdk\/dist\/types$/, replacement: fileURLToPath(new URL('./src/stubs/squid.ts', import.meta.url)) },
      { find: /^@0xsquid\/sdk$/, replacement: fileURLToPath(new URL('./src/stubs/squid.ts', import.meta.url)) }
    ]
  },
  server: {
    port: 5173,
    // Proxy the auth app so sign-in works on localhost (same-origin → shared identity storage).
    proxy: {
      '/auth': {
        target: 'https://decentraland.zone',
        changeOrigin: true,
        secure: false,
        followRedirects: true,
        ws: true
      }
    }
  }
  // TODO (perf): decentraland-ui2 makes the main chunk large (~1.9MB). Code-split via
  // build.rollupOptions.output.manualChunks (split ui2 / connect / wallets) + lazy-load WearablePreview.
})
