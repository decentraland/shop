import { Lifecycle } from '@well-known-components/interfaces'

import { setupRouter } from './controllers/routes'
import { AppComponents, GlobalContext, TestComponents } from './types/system'

/**
 * Wires the HTTP router onto the server and starts all ports (db, timers, etc). This is
 * the standard WKC service entrypoint invoked by Lifecycle.run.
 */
export async function main(program: Lifecycle.EntryPointParameters<AppComponents | TestComponents>) {
  const { components, startComponents } = program
  const globalContext: GlobalContext = { components }

  const router = await setupRouter(globalContext)
  components.server.use(router.middleware())
  components.server.use(router.allowedMethods())
  components.server.setContext(globalContext)

  await startComponents()
}
