import { IConfigComponent } from '@well-known-components/interfaces'

import { ITreasuryConfigComponent } from '../../types/components'

import { ChainAddresses, getDefaultAddresses } from './chains'
import { RefillStrategy, SignerMode, SwapMode, TreasuryConfig } from './types'

/**
 * Loads and validates the treasury configuration once at boot.
 *
 * Precedence for chain addresses: explicit env var (e.g. `MANA_ADDRESS`) wins; otherwise
 * the per-chain baked-in default is used (only Amoy has defaults). Production chains must
 * supply every address via env.
 *
 * Safety invariants enforced here (fail fast at boot, never mid-flight):
 *   - the dev signer is refused unless NODE_ENV!==production AND ALLOW_DEV_SIGNER=true
 *   - refillThreshold <= targetBalance, minRefill >= 0
 *   - slippage/buffer bps are sane
 *
 * @throws if a required address is missing or a guard/invariant is violated.
 */
export async function createTreasuryConfigComponent({
  config
}: {
  config: IConfigComponent
}): Promise<ITreasuryConfigComponent> {
  const chainId = await config.requireNumber('CHAIN_ID')
  const defaults = getDefaultAddresses(chainId)

  const addresses = await resolveAddresses(config, defaults)

  const signerMode = await resolveSignerMode(config)
  const swapMode = parseEnum(await config.getString('SWAP_MODE'), SwapMode, SwapMode.MOCK)
  const refillStrategy = parseEnum(
    await config.getString('REFILL_STRATEGY'),
    RefillStrategy,
    RefillStrategy.WORKING_BALANCE
  )

  const targetManaBalance = (await config.getNumber('REFILL_TARGET_MANA')) ?? 1000
  const refillThresholdMana = (await config.getNumber('REFILL_THRESHOLD_MANA')) ?? 200
  const minRefillMana = (await config.getNumber('REFILL_MIN_MANA')) ?? 10
  const slippageBps = (await config.getNumber('SWAP_SLIPPAGE_BPS')) ?? 300
  const oracleSpreadBufferBps = (await config.getNumber('SWAP_ORACLE_SPREAD_BUFFER_BPS')) ?? 50
  const dexAggregatorUrl = await config.getString('DEX_AGGREGATOR_URL')
  const refillMaxPerWindow = (await config.getNumber('REFILL_MAX_PER_WINDOW')) ?? 20
  const refillWindowSeconds = (await config.getNumber('REFILL_WINDOW_SECONDS')) ?? 3600

  validateInvariants({
    targetManaBalance,
    refillThresholdMana,
    minRefillMana,
    slippageBps,
    oracleSpreadBufferBps,
    refillMaxPerWindow,
    refillWindowSeconds
  })

  if (swapMode === SwapMode.DEX && !dexAggregatorUrl) {
    throw new Error('SWAP_MODE=dex requires DEX_AGGREGATOR_URL to be set')
  }

  const resolved: TreasuryConfig = {
    chainId,
    addresses,
    signerMode,
    swapMode,
    refillStrategy,
    targetManaBalance,
    refillThresholdMana,
    minRefillMana,
    slippageBps,
    oracleSpreadBufferBps,
    dexAggregatorUrl,
    refillMaxPerWindow,
    refillWindowSeconds
  }

  return {
    get: () => resolved
  }
}

async function resolveAddresses(
  config: IConfigComponent,
  defaults: ChainAddresses | null
): Promise<ChainAddresses> {
  return {
    mana: await requireAddress(config, 'MANA_ADDRESS', defaults?.mana),
    usdc: await requireAddress(config, 'USDC_ADDRESS', defaults?.usdc),
    manaUsdOracle: await requireAddress(config, 'MANA_USD_ORACLE_ADDRESS', defaults?.manaUsdOracle),
    creditsManager: await requireAddress(config, 'CREDITS_MANAGER_ADDRESS', defaults?.creditsManager),
    marketplace: await requireAddress(config, 'MARKETPLACE_ADDRESS', defaults?.marketplace)
  }
}

async function requireAddress(config: IConfigComponent, key: string, fallback?: string): Promise<string> {
  const fromEnv = await config.getString(key)
  const value = fromEnv || fallback
  if (!value) {
    throw new Error(`Missing required address config: ${key} (no per-chain default available)`)
  }
  return value.toLowerCase()
}

/**
 * Resolves the signer mode and enforces the dev-signer guard. The dev (local key) signer
 * is a footgun in production, so it is only permitted when BOTH NODE_ENV!==production and
 * ALLOW_DEV_SIGNER=true. Any other combination that asks for dev throws at boot.
 */
async function resolveSignerMode(config: IConfigComponent): Promise<SignerMode> {
  const requested = parseEnum(await config.getString('SIGNER_MODE'), SignerMode, SignerMode.KMS)
  if (requested === SignerMode.DEV) {
    const nodeEnv = (await config.getString('NODE_ENV')) ?? 'development'
    const allowDevSigner = (await config.getString('ALLOW_DEV_SIGNER')) === 'true'
    if (nodeEnv === 'production' || !allowDevSigner) {
      throw new Error(
        'SIGNER_MODE=dev is refused: the local-key signer requires NODE_ENV!==production AND ALLOW_DEV_SIGNER=true. ' +
          'Production must use SIGNER_MODE=kms.'
      )
    }
  }
  return requested
}

function validateInvariants(cfg: {
  targetManaBalance: number
  refillThresholdMana: number
  minRefillMana: number
  slippageBps: number
  oracleSpreadBufferBps: number
  refillMaxPerWindow: number
  refillWindowSeconds: number
}): void {
  if (cfg.targetManaBalance <= 0) {
    throw new Error(`REFILL_TARGET_MANA must be > 0, got ${cfg.targetManaBalance}`)
  }
  if (cfg.refillThresholdMana < 0 || cfg.refillThresholdMana > cfg.targetManaBalance) {
    throw new Error(
      `REFILL_THRESHOLD_MANA must be in [0, REFILL_TARGET_MANA] (${cfg.targetManaBalance}), got ${cfg.refillThresholdMana}`
    )
  }
  if (cfg.minRefillMana < 0) {
    throw new Error(`REFILL_MIN_MANA must be >= 0, got ${cfg.minRefillMana}`)
  }
  if (cfg.slippageBps < 0 || cfg.slippageBps > 10_000) {
    throw new Error(`SWAP_SLIPPAGE_BPS must be in [0, 10000], got ${cfg.slippageBps}`)
  }
  if (cfg.oracleSpreadBufferBps < 0) {
    throw new Error(`SWAP_ORACLE_SPREAD_BUFFER_BPS must be >= 0, got ${cfg.oracleSpreadBufferBps}`)
  }
  if (!Number.isInteger(cfg.refillMaxPerWindow) || cfg.refillMaxPerWindow <= 0) {
    throw new Error(`REFILL_MAX_PER_WINDOW must be a positive integer, got ${cfg.refillMaxPerWindow}`)
  }
  if (!Number.isInteger(cfg.refillWindowSeconds) || cfg.refillWindowSeconds <= 0) {
    throw new Error(`REFILL_WINDOW_SECONDS must be a positive integer, got ${cfg.refillWindowSeconds}`)
  }
}

function parseEnum<T extends Record<string, string>>(
  value: string | undefined,
  enumObj: T,
  fallback: T[keyof T]
): T[keyof T] {
  if (value === undefined || value === '') {
    return fallback
  }
  const values = Object.values(enumObj) as string[]
  if (!values.includes(value)) {
    throw new Error(`Invalid enum value "${value}". Expected one of: ${values.join(', ')}`)
  }
  return value as T[keyof T]
}
