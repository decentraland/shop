import path from 'path'

import { createSchemaValidatorComponent } from '@dcl/schema-validator-component'
import { createDotEnvConfigComponent } from '@well-known-components/env-config-provider'
import { createFetchComponent } from '@well-known-components/fetch-component'
import {
  createServerComponent,
  createStatusCheckComponent,
  instrumentHttpServerWithPromClientRegistry
} from '@well-known-components/http-server'
import { createLogComponent } from '@well-known-components/logger'
import { createMetricsComponent } from '@well-known-components/metrics'
import { createPgComponent } from '@well-known-components/pg-component'

import { createChainReaderComponent } from './adapters/chain/chain-reader'
import { createRpcProvider } from './adapters/chain/provider'
import { createDbAdapter } from './adapters/db'
import { createTreasurySignerComponent } from './adapters/signer'
import { createTreasuryConfigComponent } from './logic/config'
import { createReconcileComponent } from './logic/treasury/reconcile'
import { createRefillComponent } from './logic/treasury/refill'
import { createRefillJobComponent } from './logic/treasury/refill/job'
import { createSwapperComponent } from './logic/treasury/swap'
import { getDbConnectionString } from './logic/utils'
import { metricDeclarations } from './metrics'
import { AppComponents, GlobalContext } from './types/system'

/**
 * Wires the whole treasury service. Order matters: config -> provider -> chain reader ->
 * signer -> swapper -> reconcile -> refill -> job. Every module depends only on interfaces,
 * so the concrete signer/swapper implementations are selected inside their factories from
 * the treasury config.
 */
export async function initComponents(): Promise<AppComponents> {
  const config = await createDotEnvConfigComponent({ path: ['.env.default', '.env'] })
  const metrics = await createMetricsComponent(metricDeclarations, { config })
  const logs = await createLogComponent({ metrics, config })

  const server = await createServerComponent<GlobalContext>(
    { config, logs },
    {
      cors: {
        origin: true,
        methods: ['GET', 'POST', 'OPTIONS'],
        allowedHeaders: ['Cache-Control', 'Content-Type', 'Origin', 'Accept', 'Authorization'],
        credentials: true,
        maxAge: 86400
      }
    }
  )
  const statusChecks = await createStatusCheckComponent({ server, config })
  const fetch = createFetchComponent()
  const schemaValidator = await createSchemaValidatorComponent({ ensureJsonContentType: false })

  await instrumentHttpServerWithPromClientRegistry({ metrics, server, config, registry: metrics.registry! })

  const treasuryConfig = await createTreasuryConfigComponent({ config })

  const provider = await createRpcProvider({ config })
  const chainReader = createChainReaderComponent({ provider, treasuryConfig, logs })
  const signer = await createTreasurySignerComponent({ config, logs, provider, treasuryConfig })

  const pg = await createPgComponent(
    { logs, config, metrics },
    {
      migration: {
        databaseUrl: await getDbConnectionString(config),
        dir: path.resolve(__dirname, 'migrations'),
        migrationsTable: 'pgmigrations',
        ignorePattern: '.*\\.map',
        direction: 'up'
      }
    }
  )
  const db = await createDbAdapter({ pg })

  const swapper = createSwapperComponent({ chainReader, treasuryConfig, signer, fetch, logs })
  const reconcile = createReconcileComponent({ db, chainReader, signer, treasuryConfig, logs, metrics })
  const refill = createRefillComponent({ chainReader, swapper, signer, reconcile, treasuryConfig, logs, metrics })

  const refillIntervalMs = (await config.getNumber('REFILL_INTERVAL_MS')) ?? 30_000
  const refillJob = createRefillJobComponent({ refill, logs, intervalMs: refillIntervalMs })

  return {
    config,
    logs,
    server,
    statusChecks,
    metrics,
    fetch,
    schemaValidator,
    treasuryConfig,
    signer,
    chainReader,
    swapper,
    refill,
    reconcile,
    db,
    pg,
    refillJob
  }
}
