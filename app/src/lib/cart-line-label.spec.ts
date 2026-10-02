import { describe, it, expect } from 'vitest'
import { t } from '~/intl/i18n'
import type { CartLineAvailability } from '~/lib/cart-availability'
import { unavailableLabel } from '~/lib/cart-line-label'

describe.each([
  ['sold-out', 'cart.availability.soldOut'],
  ['paused', 'cart.availability.paused'],
  ['unavailable', 'cart.availability.unavailable']
] as [CartLineAvailability, string][])('when a cart line is %s', (status, key) => {
  it('should be labelled with its reason', () => {
    expect(unavailableLabel(status)).toBe(t(key))
  })
})
