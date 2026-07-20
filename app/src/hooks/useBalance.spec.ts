import { describe, it, expect } from 'vitest'
import { balanceLabel } from '~/hooks/useBalance'

describe('when labelling a credit balance for display', () => {
  it('should show a dash on a failed fetch so a transient error never reads as "0 credits"', () => {
    expect(balanceLabel(undefined, true)).toBe('—')
    // Even if stale data is present, an error still shows the dash (fail-safe, U3).
    expect(balanceLabel({ balanceCents: 5000, credits: 500 }, true)).toBe('—')
  })

  it('should show the credit count when the balance is known and the fetch is healthy', () => {
    expect(balanceLabel({ balanceCents: 5000, credits: 500 }, false)).toBe(500)
    expect(balanceLabel({ balanceCents: 0, credits: 0 }, false)).toBe(0)
  })

  it('should show 0 while loading (balance undefined, no error)', () => {
    expect(balanceLabel(undefined, false)).toBe(0)
  })
})
