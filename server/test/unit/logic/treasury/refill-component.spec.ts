import { BigNumber, utils } from 'ethers'

import { ERC20_ABI } from '../../../../src/adapters/chain/abis'
import { RefillStrategy } from '../../../../src/logic/config/types'
import { applyBufferBps, manaEtherToBase, manaToUsdc } from '../../../../src/logic/treasury/math'
import { createRefillComponent } from '../../../../src/logic/treasury/refill/component'
import {
  IChainReaderComponent,
  IDbComponent,
  IReconcileComponent,
  IRefillComponent,
  ISwapperComponent,
  ITreasurySignerComponent
} from '../../../../src/types/components'
import {
  createChainReaderMock,
  createDbMock,
  createLogsMock,
  createMetricsMock,
  createReconcileMock,
  createSignerMock,
  createSwapperMock,
  createTreasuryConfigMock
} from '../../../mocks'

const PRICE_1USD = BigNumber.from('100000000') // $1/MANA
const AMOY_MANA = '0x7ad72b9f944ea9793cf4055d88f81138cc2c63a0'
const AMOY_CREDITS_MANAGER = '0x8052a560e6e6ac86eeb7e711a4497f639b322fb3'

const erc20 = new utils.Interface(ERC20_ABI)

let chainReader: jest.Mocked<IChainReaderComponent>
let swapper: jest.Mocked<ISwapperComponent>
let signer: jest.Mocked<ITreasurySignerComponent>
let reconcile: jest.Mocked<IReconcileComponent>
let db: jest.Mocked<IDbComponent>
let refill: IRefillComponent

function buildRefill(configOverrides = {}) {
  const treasuryConfig = createTreasuryConfigMock({
    targetManaBalance: 1000,
    refillThresholdMana: 200,
    minRefillMana: 10,
    oracleSpreadBufferBps: 50,
    refillStrategy: RefillStrategy.WORKING_BALANCE,
    ...configOverrides
  })
  return createRefillComponent({
    chainReader,
    swapper,
    signer,
    reconcile,
    db,
    treasuryConfig,
    logs: createLogsMock(),
    metrics: createMetricsMock()
  })
}

beforeEach(() => {
  chainReader = createChainReaderMock({ getOraclePrice: jest.fn().mockResolvedValue(PRICE_1USD) })
  swapper = createSwapperMock()
  signer = createSignerMock()
  reconcile = createReconcileMock()
  db = createDbMock()
})

describe('when the CreditsManager balance is healthy', () => {
  beforeEach(() => {
    chainReader.getManaBalance.mockResolvedValue(manaEtherToBase(500))
    refill = buildRefill()
  })

  it('should plan no refill', async () => {
    const plan = await refill.planRefill()
    expect(plan.shouldRefill).toBe(false)
  })

  it('should not swap or transfer on runOnce', async () => {
    const outcome = await refill.runOnce()
    expect(outcome.executed).toBe(false)
    expect(swapper.swapUsdcForMana).not.toHaveBeenCalled()
    expect(signer.sendTransaction).not.toHaveBeenCalled()
    expect(reconcile.recordRefill).not.toHaveBeenCalled()
  })
})

describe('when the CreditsManager balance is below the threshold', () => {
  const shortfallMana = manaEtherToBase(900) // target 1000 - balance 100

  beforeEach(() => {
    chainReader.getManaBalance.mockResolvedValue(manaEtherToBase(100))
    swapper.swapUsdcForMana.mockResolvedValue({
      usdcSpent: manaToUsdc(shortfallMana, PRICE_1USD),
      manaReceived: shortfallMana,
      oraclePrice: PRICE_1USD,
      txHash: null
    })
    refill = buildRefill()
  })

  it('should plan a refill up to the target', async () => {
    const plan = await refill.planRefill()
    expect(plan.shouldRefill).toBe(true)
    expect(plan.manaToAcquire.toString()).toBe(shortfallMana.toString())
  })

  it('should swap USDC over-bought by the oracle-spread buffer', async () => {
    await refill.runOnce()
    const expectedUsdc = applyBufferBps(manaToUsdc(shortfallMana, PRICE_1USD), 50)
    expect(swapper.swapUsdcForMana).toHaveBeenCalledWith(expectedUsdc)
  })

  it('should transfer the received MANA to the CreditsManager', async () => {
    await refill.runOnce()
    expect(signer.sendTransaction).toHaveBeenCalledTimes(1)
    const call = signer.sendTransaction.mock.calls[0][0]
    expect(call.to.toLowerCase()).toBe(AMOY_MANA)
    const decoded = erc20.decodeFunctionData('transfer', call.data as string)
    expect(decoded[0].toLowerCase()).toBe(AMOY_CREDITS_MANAGER)
    expect(decoded[1].toString()).toBe(shortfallMana.toString())
  })

  it('should record the refill in the ledger', async () => {
    const outcome = await refill.runOnce()
    expect(reconcile.recordRefill).toHaveBeenCalledTimes(1)
    expect(outcome.executed).toBe(true)
    expect(outcome.ledgerEntryId).toBe('refill-id')
  })
})

describe('when the swap fails', () => {
  beforeEach(() => {
    chainReader.getManaBalance.mockResolvedValue(manaEtherToBase(100))
    swapper.swapUsdcForMana.mockRejectedValue(new Error('DEX reverted'))
    refill = buildRefill()
  })

  it('should not transfer or record, and surface the error', async () => {
    const outcome = await refill.runOnce()
    expect(outcome.executed).toBe(false)
    expect(outcome.error).toContain('DEX reverted')
    expect(signer.sendTransaction).not.toHaveBeenCalled()
    expect(reconcile.recordRefill).not.toHaveBeenCalled()
  })
})

describe('when the MANA transfer fails after a successful swap', () => {
  beforeEach(() => {
    chainReader.getManaBalance.mockResolvedValue(manaEtherToBase(100))
    swapper.swapUsdcForMana.mockResolvedValue({
      usdcSpent: manaToUsdc(manaEtherToBase(900), PRICE_1USD),
      manaReceived: manaEtherToBase(900),
      oraclePrice: PRICE_1USD,
      txHash: '0xswap'
    })
    signer.sendTransaction.mockRejectedValue(new Error('transfer reverted'))
    refill = buildRefill()
  })

  it('should surface the error and not record a refill (needs manual reconcile)', async () => {
    const outcome = await refill.runOnce()
    expect(outcome.executed).toBe(false)
    expect(outcome.error).toContain('transfer reverted')
    expect(reconcile.recordRefill).not.toHaveBeenCalled()
  })
})

describe('when using the just-in-time strategy with no pending demand', () => {
  beforeEach(() => {
    chainReader.getManaBalance.mockResolvedValue(manaEtherToBase(0))
    refill = buildRefill({ refillStrategy: RefillStrategy.JUST_IN_TIME })
  })

  it('should not refill because runOnce supplies no demand', async () => {
    const outcome = await refill.runOnce()
    expect(outcome.executed).toBe(false)
  })
})

describe('when the refill rate circuit breaker is open', () => {
  beforeEach(() => {
    chainReader.getManaBalance.mockResolvedValue(manaEtherToBase(100))
    swapper.swapUsdcForMana.mockResolvedValue({
      usdcSpent: manaToUsdc(manaEtherToBase(900), PRICE_1USD),
      manaReceived: manaEtherToBase(900),
      oraclePrice: PRICE_1USD,
      txHash: null
    })
    // Already at the per-window cap (default 20 in the config mock).
    db.getRefillCountSince.mockResolvedValue(20)
    refill = buildRefill()
  })

  it('should halt: not swap, not transfer, not record, and surface circuit-breaker-open', async () => {
    const outcome = await refill.runOnce()
    expect(outcome.executed).toBe(false)
    expect(outcome.error).toBe('circuit-breaker-open')
    expect(swapper.swapUsdcForMana).not.toHaveBeenCalled()
    expect(signer.sendTransaction).not.toHaveBeenCalled()
    expect(reconcile.recordRefill).not.toHaveBeenCalled()
  })
})

describe('when another instance holds the refill advisory lock', () => {
  beforeEach(() => {
    chainReader.getManaBalance.mockResolvedValue(manaEtherToBase(100))
    // Lock not acquired -> the body never runs.
    db.tryRunWithRefillLock.mockResolvedValue({ acquired: false })
    refill = buildRefill()
  })

  it('should skip the refill without swapping or transferring', async () => {
    const outcome = await refill.runOnce()
    expect(outcome.executed).toBe(false)
    expect(outcome.error).toBe('refill-locked')
    expect(swapper.swapUsdcForMana).not.toHaveBeenCalled()
    expect(signer.sendTransaction).not.toHaveBeenCalled()
  })
})
