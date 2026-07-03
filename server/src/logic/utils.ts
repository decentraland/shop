import { IConfigComponent } from '@well-known-components/interfaces'

/**
 * Builds the Postgres connection string from config. Prefers a full connection string
 * (`PG_COMPONENT_PSQL_CONNECTION_STRING`); otherwise assembles one from discrete parts.
 * Mirrors the credits-server helper so ops config carries over.
 */
export async function getDbConnectionString(config: IConfigComponent): Promise<string> {
  const connectionString = await config.getString('PG_COMPONENT_PSQL_CONNECTION_STRING')
  if (connectionString) {
    return connectionString
  }
  const user = await config.requireString('PG_COMPONENT_PSQL_USER')
  const database = await config.requireString('PG_COMPONENT_PSQL_DATABASE')
  const port = await config.requireString('PG_COMPONENT_PSQL_PORT')
  const host = await config.requireString('PG_COMPONENT_PSQL_HOST')
  const password = await config.requireString('PG_COMPONENT_PSQL_PASSWORD')
  return `postgres://${user}:${password}@${host}:${port}/${database}`
}
