import { IBaseComponent, ILoggerComponent } from '@well-known-components/interfaces'
import { START_COMPONENT, STOP_COMPONENT } from '@well-known-components/interfaces'

import { IRefillComponent } from '../../../types/components'

/**
 * WKC worker component that runs the refill cycle on a fixed interval.
 *
 * Lifecycle-managed (START/STOP): the interval is created on start and cleared on stop so
 * the process shuts down cleanly (no dangling timers). Each tick calls
 * {@link IRefillComponent.runOnce}; a healthy balance makes the tick a cheap no-op. Errors
 * are swallowed and logged so one bad cycle never kills the loop.
 *
 * @param intervalMs how often to run a cycle (e.g. 30s). Small enough that the working
 *        balance is refilled well within the volume window it is sized for.
 */
export function createRefillJobComponent({
  refill,
  logs,
  intervalMs
}: {
  refill: IRefillComponent
  logs: ILoggerComponent
  intervalMs: number
}): IBaseComponent {
  const logger = logs.getLogger('refill-job')
  let handle: NodeJS.Timeout | undefined
  let running = false

  async function tick(): Promise<void> {
    if (running) {
      // Skip if the previous cycle is still in flight (slow RPC) — avoids overlap.
      return
    }
    running = true
    try {
      const outcome = await refill.runOnce()
      if (outcome.executed) {
        logger.info('Refill cycle executed', { ledgerEntryId: outcome.ledgerEntryId ?? 'unknown' })
      }
    } catch (error) {
      logger.error('Refill cycle threw', {
        error: error instanceof Error ? error.message : String(error)
      })
    } finally {
      running = false
    }
  }

  return {
    [START_COMPONENT]: async () => {
      logger.info('Starting refill job', { intervalMs })
      handle = setInterval(() => {
        void tick()
      }, intervalMs)
    },
    [STOP_COMPONENT]: async () => {
      logger.info('Stopping refill job')
      if (handle) {
        clearInterval(handle)
        handle = undefined
      }
    }
  }
}
