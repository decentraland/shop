// Runtime config for the migration tool. All overridable via env (fake defaults for testnet/Amoy).
// NO secrets live here — the DB connection string, if used, is read from the environment at call
// time and never logged.

export type RoundMode = 'credit' | 'up' | 'down' | 'none'
export type CancelMode = 'after-post' | 'cancel-first' | 'keep'
export type Source = 'api' | 'db'

export const config = {
  // Where classic listings are READ from and where the new USD-pegged trades are POSTed.
  marketplaceServerUrl: process.env.MARKETPLACE_SERVER_URL ?? 'https://marketplace-api.decentraland.zone',
  // Read-only RPC for the target chain (oracle + signature-index reads, decoupled from any wallet).
  rpcUrl: process.env.RPC_URL ?? 'https://rpc-amoy.polygon.technology',
  // Target chain. Amoy testnet by default.
  chainId: Number(process.env.CHAIN_ID ?? 80002),
  // Fallback MANA/USD aggregator (Amoy mock, 8 decimals) — used ONLY if reading manaUsdAggregator()
  // off the marketplace contract fails.
  fallbackAggregator: process.env.MANA_USD_AGGREGATOR ?? '0xdcf00f5f60b62b07e668a84c0cedaf6f453d416e',
  // Read-only DAPPS DB connection (schema 'marketplace' + 'squid_marketplace'). Used only for the
  // `--source db` primary-listing enumeration path. Read the value lazily from env so it never sits
  // in memory unless a db run is requested. NEVER logged.
  dappsDbConnectionEnvVar: 'DAPPS_PG_COMPONENT_PSQL_CONNECTION_STRING',
  // Default fresh expiration when re-listing (or re-listing an expired one with --include-expired).
  defaultExpirationDays: Number(process.env.EXPIRATION_DAYS ?? 180),
  // Never list below this many credits (1 credit = $0.10). Guards against sub-credit dust → free.
  minCredits: Number(process.env.MIN_CREDITS ?? 1),
}

// 1 credit = $0.10 ⇒ $1 = 1e18 USD wei = 10 credits ⇒ 1 credit = 1e17 USD wei.
export const USD_WEI_PER_CREDIT = 100000000000000000n
