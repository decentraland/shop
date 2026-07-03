import { getDefaultHttpMetrics } from '@well-known-components/http-server'
import { metricDeclarations as logsMetricDeclarations } from '@well-known-components/logger'
import { validateMetricsDeclaration } from '@well-known-components/metrics'

export const metricDeclarations = {
  ...getDefaultHttpMetrics(),
  ...logsMetricDeclarations,
  treasury_refills_total: {
    help: 'Total number of CreditsManager MANA refills executed',
    type: 'counter' as const,
    labelNames: ['strategy']
  },
  treasury_refill_failures_total: {
    help: 'Total number of failed refill cycles',
    type: 'counter' as const,
    labelNames: []
  },
  treasury_mana_acquired_total: {
    help: 'Total MANA acquired via USDC->MANA swaps (ether units)',
    type: 'counter' as const,
    labelNames: []
  },
  treasury_usdc_spent_total: {
    help: 'Total USDC spent on swaps (dollar units)',
    type: 'counter' as const,
    labelNames: []
  },
  treasury_credits_manager_mana_balance: {
    help: 'Last observed CreditsManager MANA balance (ether units)',
    type: 'gauge' as const,
    labelNames: []
  },
  treasury_reconciliation_drift_bps: {
    help: 'Reconciliation drift between expected and actual balances, in basis points',
    type: 'gauge' as const,
    labelNames: ['account']
  },
  treasury_reconciliation_healthy: {
    help: 'Whether the last reconciliation was within tolerance for all accounts (1/0)',
    type: 'gauge' as const,
    labelNames: []
  }
} as const

// type assertions
validateMetricsDeclaration(metricDeclarations)
