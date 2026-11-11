import { describe, it, expect } from 'vitest'
import { formatDateRange } from '~/lib/dates'

describe('when formatting a span of days', () => {
  it('should name both ends', () => {
    const text = formatDateRange(new Date(2026, 8, 1).getTime(), new Date(2026, 8, 8).getTime())
    expect(text).toMatch(/1/)
    expect(text).toMatch(/8/)
    expect(text).toMatch(/2026/)
  })

  it('should fall back to the first day when the span runs backwards', () => {
    const from = new Date(2026, 8, 8).getTime()
    expect(formatDateRange(from, new Date(2026, 8, 1).getTime())).toBe(
      new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(from))
    )
  })
})
