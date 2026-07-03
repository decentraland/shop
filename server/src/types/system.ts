import { ISchemaValidatorComponent } from '@dcl/schema-validator-component'
import {
  IBaseComponent,
  IConfigComponent,
  IFetchComponent,
  IHttpServerComponent,
  ILoggerComponent,
  IMetricsComponent
} from '@well-known-components/interfaces'
import { IPgComponent } from '@well-known-components/pg-component'

import { metricDeclarations } from '../metrics'

import {
  IChainReaderComponent,
  IDbComponent,
  IReconcileComponent,
  IRefillComponent,
  ISwapperComponent,
  ITreasuryConfigComponent,
  ITreasurySignerComponent
} from './components'

export type GlobalContext = {
  components: BaseComponents
}

// Components present in every environment (runtime + tests).
export type BaseComponents = {
  config: IConfigComponent
  logs: ILoggerComponent
  server: IHttpServerComponent<GlobalContext>
  metrics: IMetricsComponent<keyof typeof metricDeclarations>
  fetch: IFetchComponent
  schemaValidator: ISchemaValidatorComponent<GlobalContext>

  treasuryConfig: ITreasuryConfigComponent
  signer: ITreasurySignerComponent
  chainReader: IChainReaderComponent
  swapper: ISwapperComponent
  refill: IRefillComponent
  reconcile: IReconcileComponent
  db: IDbComponent
}

// Components only wired at runtime.
export type AppComponents = BaseComponents & {
  statusChecks: IBaseComponent
  pg: IPgComponent
  refillJob: IBaseComponent
}

// Components only wired in tests.
export type TestComponents = BaseComponents & {
  localFetch: IFetchComponent
}

// Simplifies typing HTTP handlers: only Pick the components each handler needs.
export type HandlerContextWithPath<
  ComponentNames extends keyof AppComponents,
  Path extends string = any
> = IHttpServerComponent.PathAwareContext<
  IHttpServerComponent.DefaultContext<{
    components: Pick<AppComponents, ComponentNames>
  }>,
  Path
>

export type Context<Path extends string = any> = IHttpServerComponent.PathAwareContext<GlobalContext, Path>
