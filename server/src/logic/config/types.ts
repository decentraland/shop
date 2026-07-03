import { ChainAddresses } from './chains'

/** Which custody backend signs treasury transactions. */
export enum SignerMode {
  /** AWS KMS asymmetric key (secp256k1). Production. No raw key in the service. */
  KMS = 'kms',
  /** Local private key from env. Amoy / dev only, guarded. NEVER in production. */
  DEV = 'dev'
}

/** Which USDC -> MANA swap backend is used. */
export enum SwapMode {
  /** Real DEX aggregator (0x / 1inch / Uniswap v3). Production. */
  DEX = 'dex',
  /** Simulated swap at the mock oracle rate. Amoy testnet (no DEX liquidity). */
  MOCK = 'mock'
}

/**
 * Refill strategy for keeping the CreditsManager funded with MANA.
 * See VISION.md §4 / §7.
 */
export enum RefillStrategy {
  /**
   * Keep a small MANA working balance in the CreditsManager, refilled in batches when it
   * dips below a threshold. Recommended (D4): 1 tx per purchase, fast UX, tiny bounded
   * float risk on the buffer.
   */
  WORKING_BALANCE = 'working-balance',
  /**
   * Swap exactly what is needed right before consumption — zero standing MANA, ~zero
   * price risk, but 2 on-chain steps around each purchase.
   */
  JUST_IN_TIME = 'just-in-time'
}

/**
 * Fully-resolved treasury configuration. Produced once at boot by the config component
 * from env vars + per-chain defaults, then injected everywhere. Immutable after boot.
 */
export type TreasuryConfig = {
  chainId: number
  addresses: ChainAddresses

  signerMode: SignerMode
  swapMode: SwapMode
  refillStrategy: RefillStrategy

  /**
   * Target MANA balance (in ether, human units) the working-balance strategy tops the
   * CreditsManager up to. The refill job swaps enough USDC to reach this level.
   */
  targetManaBalance: number
  /**
   * When the CreditsManager MANA balance drops below this (in ether), a refill is
   * triggered. Must be <= targetManaBalance.
   */
  refillThresholdMana: number
  /**
   * Do not refill unless the shortfall is at least this many MANA. Prevents a storm of
   * tiny dust swaps when the balance hovers just under the threshold.
   */
  minRefillMana: number

  /**
   * Slippage tolerance for the DEX swap, in basis points (1% = 100 bps). The swap must
   * return at least `oracleQuote * (1 - slippageBps/10000)` MANA or it reverts.
   */
  slippageBps: number
  /**
   * Extra MANA bought on top of the oracle quote, in basis points, to cover the spread
   * between the Chainlink oracle price the contract settles at and the DEX fill price
   * (VISION.md risks table). Applied to the USDC amount before swapping.
   */
  oracleSpreadBufferBps: number

  /** DEX aggregator base URL (0x / 1inch style). Only used in SwapMode.DEX. */
  dexAggregatorUrl?: string
}
