import { timingSafeEqual } from 'node:crypto'
import { Router } from '@well-known-components/http-server'

import { GlobalContext } from '../types/system'

import { getStatusHandler } from './handlers/get-status'
import { getTreasuryStatusHandler } from './handlers/get-treasury-status'
import { recordDepositHandler } from './handlers/record-deposit'
import { RecordDepositRequestSchema } from './schemas/record-deposit'

/**
 * Wires the internal/admin HTTP surface. The service is a treasury backend, not a public
 * API, so the surface is deliberately small:
 *   - GET  /status            liveness/version (unauthenticated, no chain/DB)
 *   - GET  /treasury/status   balances + ledger + reconciliation (ops)
 *   - POST /treasury/deposits record a USDC inflow (payments flow -> ledger)
 *
 * Admin endpoints are gated by a bearer token so only the payments/ops services can call
 * them. The token is read from config at wiring time.
 */
export async function setupRouter(globalContext: GlobalContext): Promise<Router<GlobalContext>> {
  const router = new Router<GlobalContext>()
  const { config, schemaValidator } = globalContext.components

  const adminToken = await config.requireString('API_ADMIN_TOKEN')

  router.get('/status', getStatusHandler)
  router.get('/treasury/status', bearerTokenMiddleware(adminToken), getTreasuryStatusHandler)
  router.post(
    '/treasury/deposits',
    bearerTokenMiddleware(adminToken),
    schemaValidator.withSchemaValidatorMiddleware(RecordDepositRequestSchema),
    recordDepositHandler
  )

  return router
}

/**
 * Minimal bearer-token guard for internal endpoints. Returns 401 unless the request
 * carries `Authorization: Bearer <token>` matching the configured admin token. Kept local
 * (rather than pulling platform-server-commons) so the service has no auth surface beyond
 * this single, auditable check.
 */
function tokenMatches(authHeader: string, expected: string): boolean {
  // Constant-time compare so the token isn't discoverable by response timing.
  const a = Buffer.from(authHeader)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

function bearerTokenMiddleware(expectedToken: string) {
  return async (context: { request: { headers: { get(name: string): string | null } } }, next: () => Promise<any>) => {
    const authHeader = context.request.headers.get('authorization')
    const expected = `Bearer ${expectedToken}`
    if (!authHeader || !tokenMatches(authHeader, expected)) {
      return { status: 401, body: { error: 'Unauthorized' } }
    }
    return next()
  }
}
