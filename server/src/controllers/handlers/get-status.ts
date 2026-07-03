import { HandlerContextWithPath } from '../../types/system'

/**
 * Liveness/version endpoint. Cheap, unauthenticated, no chain or DB calls — safe for
 * load-balancer health checks.
 */
export async function getStatusHandler(context: HandlerContextWithPath<'config', '/status'>) {
  const {
    components: { config }
  } = context

  const version = (await config.getString('CURRENT_VERSION')) ?? ''
  const commitHash = (await config.getString('COMMIT_HASH')) ?? ''

  return {
    status: 200,
    body: {
      version,
      commitHash,
      currentTime: Date.now()
    }
  }
}
