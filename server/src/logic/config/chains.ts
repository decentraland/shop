/**
 * On-chain address book keyed by chain id.
 *
 * These are the deployed contracts the treasury interacts with. Amoy (80002) is the
 * test target and the only chain wired with real defaults; production values live in
 * env config (see `.env.example` / `treasury-config`) and MUST NOT be hardcoded here.
 *
 * Amoy addresses come from the task spec / VISION.md and are safe to commit — they are
 * public testnet contracts with no value at risk.
 */

export const AMOY_CHAIN_ID = 80002
export const POLYGON_CHAIN_ID = 137

export type ChainAddresses = {
  /** MANA ERC-20 token. */
  mana: string
  /** USDC ERC-20 token (Circle). */
  usdc: string
  /** Chainlink-style MANA/USD price feed (decimals=8, latestRoundData). */
  manaUsdOracle: string
  /** CreditsManagerPolygon — custodies MANA and settles trades. */
  creditsManager: string
  /** Offchain Marketplace V4 — accept([trade]) target. */
  marketplace: string
}

/**
 * Amoy testnet defaults. The CreditsManager here is pre-funded with test MANA, and the
 * oracle is a mock Chainlink aggregator (~$0.2696). There is NO real USDC/MANA DEX
 * liquidity on Amoy, so the swap module must run in `mock` mode against this oracle.
 */
export const AMOY_ADDRESSES: ChainAddresses = {
  mana: '0x7ad72b9f944ea9793cf4055d88f81138cc2c63a0',
  usdc: '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582',
  manaUsdOracle: '0xdcf00f5f60b62b07e668a84c0cedaf6f453d416e',
  creditsManager: '0x8052a560e6e6ac86eeb7e711a4497f639b322fb3',
  marketplace: '0x1b67d0e31eeb6b52d8eeed71d3616c2f5b33b8e7'
}

/** Well-known token decimals. USDC = 6, MANA = 18. */
export const USDC_DECIMALS = 6
export const MANA_DECIMALS = 18
/** Chainlink aggregators report price with 8 decimals by default. */
export const ORACLE_DECIMALS = 8

/**
 * Returns the built-in defaults for a chain id, or null when the chain has no baked-in
 * address book (production chains configure everything through env vars instead).
 */
export function getDefaultAddresses(chainId: number): ChainAddresses | null {
  if (chainId === AMOY_CHAIN_ID) {
    return AMOY_ADDRESSES
  }
  return null
}
