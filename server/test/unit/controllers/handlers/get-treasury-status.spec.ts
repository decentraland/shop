import { BigNumber } from 'ethers'

import { getTreasuryStatusHandler } from '../../../../src/controllers/handlers/get-treasury-status'
import { IChainReaderComponent, IReconcileComponent, ITreasurySignerComponent } from '../../../../src/types/components'
import {
  createChainReaderMock,
  createLogsMock,
  createReconcileMock,
  createSignerMock,
  createTreasuryConfigMock
} from '../../../mocks'

let chainReader: jest.Mocked<IChainReaderComponent>
let reconcile: jest.Mocked<IReconcileComponent>
let signer: jest.Mocked<ITreasurySignerComponent>

function buildContext() {
  return {
    components: {
      chainReader,
      reconcile,
      signer,
      treasuryConfig: createTreasuryConfigMock(),
      logs: createLogsMock()
    }
  } as any
}

beforeEach(() => {
  chainReader = createChainReaderMock({
    getUsdcBalance: jest.fn().mockResolvedValue(BigNumber.from('10000000')),
    getManaBalance: jest.fn().mockResolvedValue(BigNumber.from('1000000000000000000000')),
    getOraclePrice: jest.fn().mockResolvedValue(BigNumber.from('26960000'))
  })
  reconcile = createReconcileMock({
    reconcile: jest.fn().mockResolvedValue({
      timestamp: Date.now(),
      treasuryUsdc: { expected: '10000000', actual: '10000000', driftBps: 0, withinTolerance: true },
      creditsManagerMana: {
        expected: '1000000000000000000000',
        actual: '1000000000000000000000',
        driftBps: 0,
        withinTolerance: true
      },
      healthy: true
    })
  })
  signer = createSignerMock()
})

describe('when fetching treasury status', () => {
  describe('and all reads succeed', () => {
    it('should return 200 with balances, oracle price, ledger and reconciliation', async () => {
      const response = await getTreasuryStatusHandler(buildContext())
      expect(response.status).toBe(200)
      const body = response.body as any
      expect(body.balances.treasuryUsdc).toBeCloseTo(10, 6)
      expect(body.balances.creditsManagerMana).toBeCloseTo(1000, 6)
      expect(body.oracle.manaUsdPrice).toBeCloseTo(0.2696, 4)
      expect(body.reconciliation.healthy).toBe(true)
    })
  })

  describe('and a chain read fails', () => {
    beforeEach(() => {
      chainReader.getOraclePrice.mockRejectedValue(new Error('rpc down'))
    })

    it('should return 503', async () => {
      const response = await getTreasuryStatusHandler(buildContext())
      expect(response.status).toBe(503)
    })
  })
})
