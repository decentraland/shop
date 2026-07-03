import { BigNumber } from 'ethers'
import { IBaseComponent } from '@well-known-components/interfaces'

import { TreasuryConfig } from '../logic/config/types'

/**
 * Exposes the fully-resolved, immutable treasury configuration loaded at boot.
 * Everything downstream reads addresses/thresholds/mode from here rather than env.
 */
export interface ITreasuryConfigComponent {
  get: () => TreasuryConfig
}

/**
 * Custody signer abstraction. Production is backed by AWS KMS (secp256k1 asymmetric key,
 * no raw key material in the service). The dev impl loads a local key from env and is
 * guarded to non-production. Both expose the same minimal surface the treasury needs to
 * read its address and send value-moving transactions.
 */
export interface ITreasurySignerComponent extends IBaseComponent {
  /** The 0x address controlled by this signer (the treasury wallet). */
  getAddress: () => Promise<string>
  /**
   * Signs and broadcasts a transaction, returning its hash. The concrete impl decides
   * how the signature is produced (KMS remote sign vs local key). Implementations must
   * populate nonce/gas as needed.
   */
  sendTransaction: (tx: TreasuryTransactionRequest) => Promise<{ hash: string }>
}

/** Minimal transaction shape the treasury signs. Mirrors ethers' TransactionRequest subset. */
export type TreasuryTransactionRequest = {
  to: string
  data?: string
  value?: BigNumber
}

/**
 * Reads on-chain state the treasury depends on: ERC-20 balances and the Chainlink-style
 * MANA/USD oracle. Kept behind an interface so tests inject a mocked provider and the
 * refill/reconcile logic never touches ethers directly.
 */
export interface IChainReaderComponent {
  /** MANA balance (18dp base units) of an address. */
  getManaBalance: (address: string) => Promise<BigNumber>
  /** USDC balance (6dp base units) of an address. */
  getUsdcBalance: (address: string) => Promise<BigNumber>
  /** Current MANA/USD price from the oracle, in oracle base units (8dp). */
  getOraclePrice: () => Promise<BigNumber>
}

/**
 * Swaps treasury USDC into MANA on Polygon. Production uses a DEX aggregator; on Amoy a
 * mock fills at the oracle rate because there is no testnet liquidity. Config picks the
 * impl. The output is guaranteed to be >= the slippage floor the impl enforces, else it
 * throws — a partial/failed swap must not silently under-deliver.
 */
export interface ISwapperComponent {
  /**
   * @param usdcAmount USDC to spend, in base units (6dp)
   * @returns the MANA received, in base units (18dp), and the tx hash (null for mock)
   * @throws if the achievable output falls below the slippage floor
   */
  swapUsdcForMana: (usdcAmount: BigNumber) => Promise<SwapResult>
}

export type SwapResult = {
  usdcSpent: BigNumber
  manaReceived: BigNumber
  /** Oracle price used to quote the swap (8dp), for auditing. */
  oraclePrice: BigNumber
  /** On-chain swap tx hash. Null when the swap was simulated (mock mode). */
  txHash: string | null
}

/**
 * Keeps the CreditsManager's MANA balance funded. On each tick it reads the balance,
 * decides whether a refill is needed per the configured strategy, and if so swaps
 * USDC -> MANA and transfers the MANA to the CreditsManager, recording every leg in the
 * ledger for reconciliation.
 */
export interface IRefillComponent {
  /** Reads balance + strategy and returns the refill decision without executing it. */
  planRefill: () => Promise<RefillPlan>
  /** Runs one refill cycle: plan, and if needed, swap + transfer + record. */
  runOnce: () => Promise<RefillOutcome>
}

export type RefillPlan = {
  /** Whether a refill should happen now. */
  shouldRefill: boolean
  /** Current CreditsManager MANA balance (18dp). */
  currentManaBalance: BigNumber
  /** MANA the plan intends to add (18dp). Zero when shouldRefill is false. */
  manaToAcquire: BigNumber
  /** USDC the plan intends to spend to acquire that MANA (6dp). Zero when not refilling. */
  usdcToSpend: BigNumber
  /** Human-readable reason, useful in logs/status. */
  reason: string
}

export type RefillOutcome = {
  plan: RefillPlan
  executed: boolean
  swap?: SwapResult
  transferTxHash?: string
  /** Ledger entry id created for this refill, when executed. */
  ledgerEntryId?: string
  error?: string
}

/**
 * Reconciliation/ledger. Persists every treasury flow (USDC in from pack purchases,
 * MANA out from swaps + transfers, retained fees) and computes drift between the ledger's
 * expected balances and the actual on-chain/treasury balances.
 */
export interface IReconcileComponent {
  /**
   * Records a USDC inflow from a pack purchase (crediting of the user lives elsewhere).
   * Idempotent on `reference`: `alreadyRecorded` is true when a matching entry already
   * existed and no new row was written.
   */
  recordUsdcDeposit: (input: RecordDepositInput) => Promise<{ entry: LedgerEntry; alreadyRecorded: boolean }>
  /** Records a completed refill (swap + transfer) as one accounting event. */
  recordRefill: (input: RecordRefillInput) => Promise<LedgerEntry>
  /** Computes expected vs actual balances and flags drift beyond tolerance. */
  reconcile: () => Promise<ReconciliationReport>
  /** Aggregate totals from the ledger, for the status endpoint. */
  getLedgerSummary: () => Promise<LedgerSummary>
}

export enum LedgerEntryType {
  /** USDC received from a pack purchase (Stripe/onramp settlement). */
  USDC_DEPOSIT = 'usdc_deposit',
  /** USDC spent + MANA acquired + MANA transferred to the CreditsManager. */
  REFILL = 'refill',
  /** Fee retained in MANA (VISION.md §5). Recorded when a sale settles. */
  FEE_RETAINED = 'fee_retained'
}

export type LedgerEntry = {
  id: string
  type: LedgerEntryType
  /** USDC delta in base units (6dp); positive = in, negative = out. Stored as string. */
  usdcDelta: string
  /** MANA delta in base units (18dp); positive = in, negative = out. Stored as string. */
  manaDelta: string
  /** External reference (Stripe payment intent, tx hash, purchase id...). */
  reference: string | null
  /** Free-form JSON metadata. */
  metadata: Record<string, unknown> | null
  createdAt: number
}

export type RecordDepositInput = {
  /** USDC received, base units (6dp). */
  usdcAmount: BigNumber
  /** External payment reference — dedupe key. Deposits are idempotent on this. */
  reference: string
  metadata?: Record<string, unknown>
}

export type RecordRefillInput = {
  usdcSpent: BigNumber
  manaAcquired: BigNumber
  manaTransferred: BigNumber
  swapTxHash: string | null
  transferTxHash: string | null
  oraclePrice: BigNumber
}

export type LedgerSummary = {
  /** Net USDC the ledger believes the treasury still holds (deposits - spent). */
  expectedTreasuryUsdc: string
  /** Net MANA the ledger believes was pushed into the CreditsManager (transferred - consumed). */
  expectedCreditsManagerMana: string
  totalUsdcDeposited: string
  totalUsdcSpent: string
  totalManaAcquired: string
  totalManaTransferred: string
  totalFeeRetainedMana: string
  entryCount: number
}

export type ReconciliationReport = {
  timestamp: number
  treasuryUsdc: { expected: string; actual: string; driftBps: number; withinTolerance: boolean }
  creditsManagerMana: { expected: string; actual: string; driftBps: number; withinTolerance: boolean }
  /** True only when every tracked balance is within tolerance. */
  healthy: boolean
}

/**
 * Persistence port for the ledger. Backed by Postgres in prod; mocked in tests. Kept
 * separate from the reconcile logic so drift math is testable without a database.
 */
export interface IDbComponent {
  /**
   * Inserts a ledger entry. Idempotent when `reference` collides with an existing entry
   * of the same type — returns the existing row and reports `inserted: false`.
   */
  insertLedgerEntry: (entry: NewLedgerEntry) => Promise<{ entry: LedgerEntry; inserted: boolean }>
  getLedgerSummary: () => Promise<LedgerSummary>
  /** Most recent entries, newest first, for the status endpoint. */
  getRecentEntries: (limit: number) => Promise<LedgerEntry[]>
}

export type NewLedgerEntry = {
  type: LedgerEntryType
  usdcDelta: string
  manaDelta: string
  reference: string | null
  metadata: Record<string, unknown> | null
}
