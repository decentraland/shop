import { BigNumber } from 'ethers'

import { recordDepositHandler } from '../../../../src/controllers/handlers/record-deposit'
import { LedgerEntryType, IReconcileComponent } from '../../../../src/types/components'
import { createLogsMock, createReconcileMock } from '../../../mocks'

let reconcile: jest.Mocked<IReconcileComponent>

function buildContext(body: unknown) {
  return {
    components: { reconcile, logs: createLogsMock() },
    request: { json: jest.fn().mockResolvedValue(body) }
  } as any
}

beforeEach(() => {
  reconcile = createReconcileMock()
})

describe('when recording a USDC deposit via HTTP', () => {
  describe('and the deposit is new', () => {
    beforeEach(() => {
      reconcile.recordUsdcDeposit.mockResolvedValue({
        entry: {
          id: 'e1',
          type: LedgerEntryType.USDC_DEPOSIT,
          usdcDelta: '5000000',
          manaDelta: '0',
          reference: 'pi_123',
          metadata: null,
          createdAt: Date.now()
        },
        alreadyRecorded: false
      })
    })

    it('should return 201 and pass the parsed amount through', async () => {
      const response = await recordDepositHandler(buildContext({ usdcAmount: '5000000', reference: 'pi_123' }))
      expect(response.status).toBe(201)
      expect(reconcile.recordUsdcDeposit).toHaveBeenCalledWith(
        expect.objectContaining({ usdcAmount: BigNumber.from('5000000'), reference: 'pi_123' })
      )
      expect(response.body).toMatchObject({ alreadyRecorded: false })
    })
  })

  describe('and the deposit was already recorded', () => {
    beforeEach(() => {
      reconcile.recordUsdcDeposit.mockResolvedValue({
        entry: {
          id: 'e1',
          type: LedgerEntryType.USDC_DEPOSIT,
          usdcDelta: '5000000',
          manaDelta: '0',
          reference: 'pi_123',
          metadata: null,
          createdAt: Date.now()
        },
        alreadyRecorded: true
      })
    })

    it('should return 200 (idempotent)', async () => {
      const response = await recordDepositHandler(buildContext({ usdcAmount: '5000000', reference: 'pi_123' }))
      expect(response.status).toBe(200)
      expect(response.body).toMatchObject({ alreadyRecorded: true })
    })
  })

  describe('and recording throws', () => {
    beforeEach(() => {
      reconcile.recordUsdcDeposit.mockRejectedValue(new Error('db down'))
    })

    it('should return 500', async () => {
      const response = await recordDepositHandler(buildContext({ usdcAmount: '5000000', reference: 'pi_123' }))
      expect(response.status).toBe(500)
    })
  })
})
