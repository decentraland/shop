import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import { fileURLToPath, URL } from 'node:url';
// Build/dev config. Points at a LOCAL marketplace-server by default (see .env / config.ts).
// DCL libs (connect/dapps/crypto) need Node globals (Buffer/global/process) in the browser.
// Test config lives in vitest.config.ts.
export default defineConfig({
    plugins: [react(), nodePolyfills({ globals: { Buffer: true, global: true, process: true } })],
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
});
