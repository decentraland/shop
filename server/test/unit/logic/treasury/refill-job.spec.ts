import { START_COMPONENT, STOP_COMPONENT } from '@well-known-components/interfaces'

import { createRefillJobComponent } from '../../../../src/logic/treasury/refill/job'
import { IRefillComponent } from '../../../../src/types/components'
import { createLogsMock } from '../../../mocks'

let refill: jest.Mocked<IRefillComponent>

beforeEach(() => {
  jest.useFakeTimers()
  refill = {
    planRefill: jest.fn(),
    runOnce: jest.fn().mockResolvedValue({ plan: {} as any, executed: false })
  } as unknown as jest.Mocked<IRefillComponent>
})

afterEach(() => {
  jest.clearAllTimers()
  jest.useRealTimers()
})

describe('when running the refill job', () => {
  describe('and it has been started', () => {
    it('should invoke runOnce on each interval tick', async () => {
      const job = createRefillJobComponent({ refill, logs: createLogsMock(), intervalMs: 1000 })
      await (job as any)[START_COMPONENT]()

      jest.advanceTimersByTime(1000)
      await Promise.resolve()
      expect(refill.runOnce).toHaveBeenCalledTimes(1)

      jest.advanceTimersByTime(1000)
      await Promise.resolve()
      expect(refill.runOnce).toHaveBeenCalledTimes(2)

      await (job as any)[STOP_COMPONENT]()
    })
  })

  describe('and it has been stopped', () => {
    it('should not invoke runOnce after stop', async () => {
      const job = createRefillJobComponent({ refill, logs: createLogsMock(), intervalMs: 1000 })
      await (job as any)[START_COMPONENT]()
      await (job as any)[STOP_COMPONENT]()

      jest.advanceTimersByTime(5000)
      await Promise.resolve()
      expect(refill.runOnce).not.toHaveBeenCalled()
    })
  })

  describe('and a cycle throws', () => {
    beforeEach(() => {
      refill.runOnce.mockRejectedValue(new Error('boom'))
    })

    it('should swallow the error and keep the loop alive', async () => {
      const job = createRefillJobComponent({ refill, logs: createLogsMock(), intervalMs: 1000 })
      await (job as any)[START_COMPONENT]()

      jest.advanceTimersByTime(1000)
      await Promise.resolve()
      await Promise.resolve()

      // A second tick still fires despite the first throwing.
      jest.advanceTimersByTime(1000)
      await Promise.resolve()
      expect(refill.runOnce).toHaveBeenCalledTimes(2)

      await (job as any)[STOP_COMPONENT]()
    })
  })

  describe('and a previous cycle is still in flight', () => {
    it('should skip the overlapping tick instead of running concurrently', async () => {
      // First cycle never resolves within the test window -> `running` stays true.
      let resolveFirst: (() => void) | undefined
      refill.runOnce.mockImplementation(
        () => new Promise((res) => (resolveFirst = () => res({ plan: {} as any, executed: false })))
      )
      const job = createRefillJobComponent({ refill, logs: createLogsMock(), intervalMs: 1000 })
      await (job as any)[START_COMPONENT]()

      jest.advanceTimersByTime(1000) // tick 1: runOnce starts and stays pending
      await Promise.resolve()
      jest.advanceTimersByTime(1000) // tick 2: previous still running -> skipped
      await Promise.resolve()

      expect(refill.runOnce).toHaveBeenCalledTimes(1)

      resolveFirst?.()
      await Promise.resolve()
      await (job as any)[STOP_COMPONENT]()
    })
  })

  describe('and a cycle executes a refill', () => {
    it('should log the executed cycle with its ledger entry id', async () => {
      refill.runOnce.mockResolvedValue({ plan: {} as any, executed: true, ledgerEntryId: 'entry-1' })
      const logs = createLogsMock()
      const logger = logs.getLogger('refill-job')
      const job = createRefillJobComponent({ refill, logs, intervalMs: 1000 })
      await (job as any)[START_COMPONENT]()

      jest.advanceTimersByTime(1000)
      await Promise.resolve()
      await Promise.resolve()

      expect(logger.info).toHaveBeenCalledWith('Refill cycle executed', { ledgerEntryId: 'entry-1' })

      await (job as any)[STOP_COMPONENT]()
    })

    it('should fall back to "unknown" when an executed cycle has no ledger entry id', async () => {
      refill.runOnce.mockResolvedValue({ plan: {} as any, executed: true })
      const logs = createLogsMock()
      const logger = logs.getLogger('refill-job')
      const job = createRefillJobComponent({ refill, logs, intervalMs: 1000 })
      await (job as any)[START_COMPONENT]()

      jest.advanceTimersByTime(1000)
      await Promise.resolve()
      await Promise.resolve()

      expect(logger.info).toHaveBeenCalledWith('Refill cycle executed', { ledgerEntryId: 'unknown' })

      await (job as any)[STOP_COMPONENT]()
    })
  })
})
