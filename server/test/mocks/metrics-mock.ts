import { IMetricsComponent } from '@well-known-components/interfaces'

import { metricDeclarations } from '../../src/metrics'

export function createMetricsMock(): jest.Mocked<IMetricsComponent<keyof typeof metricDeclarations>> {
  return {
    increment: jest.fn(),
    decrement: jest.fn(),
    observe: jest.fn(),
    reset: jest.fn(),
    resetAll: jest.fn(),
    startTimer: jest.fn().mockReturnValue({ end: jest.fn() }),
    getValue: jest.fn()
  } as unknown as jest.Mocked<IMetricsComponent<keyof typeof metricDeclarations>>
}
