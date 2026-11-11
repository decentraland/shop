import { describe, it, expect } from 'vitest'
import { clearedSearchUrl } from '~/lib/searchClear'

describe('when clearing the search box', () => {
  it('should drop the query from the results page and keep the other filters', () => {
    expect(clearedSearchUrl('/items', '?q=Nebula&status=not_for_sale')).toBe('/items?status=not_for_sale')
    expect(clearedSearchUrl('/items', '?q=Nebula')).toBe('/items')
  })

  it('should stay put anywhere else, and on the results page with no query', () => {
    expect(clearedSearchUrl('/overview', '?q=Nebula')).toBeNull()
    expect(clearedSearchUrl('/item/0xabc/0', '')).toBeNull()
    expect(clearedSearchUrl('/items', '?status=not_for_sale')).toBeNull()
  })
})
