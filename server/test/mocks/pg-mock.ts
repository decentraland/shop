import { IPgComponent } from '@well-known-components/pg-component'

/**
 * A pg-component mock whose `query` is a jest.fn the test drives with mockResolvedValueOnce.
 * Only the surface the db adapter uses is implemented.
 */
export function createPgMock(): jest.Mocked<Pick<IPgComponent, 'query'>> & IPgComponent {
  return {
    query: jest.fn(),
    getPool: jest.fn(),
    start: jest.fn(),
    stop: jest.fn(),
    streamQuery: jest.fn()
  } as unknown as jest.Mocked<Pick<IPgComponent, 'query'>> & IPgComponent
}
