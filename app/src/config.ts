// Runtime config.
// - marketplaceServerUrl: where the signed USD-pegged trade is POSTed (your LOCAL server with the fix).
// - nftApiUrl: where owned NFTs are READ from. Defaults to the same server, but you can point it at
//   .zone if your local server has no Amoy NFT data indexed.
export const config = {
  // Local marketplace-server (feat/support-usd-pegged-trades) — POST target for signed trades.
  marketplaceServerUrl: import.meta.env.VITE_MARKETPLACE_SERVER_URL ?? 'http://localhost:5003',
  // Reads (catalog / owned NFTs) — local marketplace-server (dev DB: Amoy + Sepolia).
  // Override with VITE_NFT_API_URL=https://marketplace-api.decentraland.zone to read from .zone.
  nftApiUrl: import.meta.env.VITE_NFT_API_URL ?? 'http://localhost:5003',
  chainId: Number(import.meta.env.VITE_CHAIN_ID ?? 80002),
  // Auth app (method chooser). Relative '/auth' → proxied to decentraland.zone in vite (same-origin).
  authUrl: import.meta.env.VITE_AUTH_URL ?? '/auth',
  // Read-only RPC for the target chain (contract reads decoupled from the wallet's current network).
  rpcUrl: import.meta.env.VITE_RPC_URL ?? 'https://rpc-amoy.polygon.technology',
  // Credits service (buy-with-credits). Default local port is 3000; dev-mint needs ALLOW_DEV_MINT=true.
  creditsServerUrl: import.meta.env.VITE_CREDITS_SERVER_URL ?? 'http://localhost:3000',
  // builder-server — READ-ONLY here. Enumerates a creator's published collections + their publishable
  // items (contract_address, blockchain_item_id) so they can be offered for primary sale in the Shop.
  builderServerUrl: import.meta.env.VITE_BUILDER_SERVER_URL ?? 'https://builder-api.decentraland.zone',
  // shop-server (Stripe checkout + webhook + credit grant). Empty in dev → payments run MOCKED.
  shopServerUrl: import.meta.env.VITE_SHOP_SERVER_URL ?? '',
  // Stripe TEST-mode publishable key (pk_test_…). Empty in dev → the get-credits flow uses the
  // built-in mock (no real Stripe widget). NEVER put a secret key (sk_…) in the frontend.
  stripePublishableKey: import.meta.env.VITE_STRIPE_PK ?? ''
}
