import { t } from '~/intl/i18n'
import type { CartLineAvailability } from '~/lib/cart-availability'

/** Why a cart line cannot be bought, as shown on the line. */
export function unavailableLabel(status: CartLineAvailability | undefined): string {
  if (status === 'sold-out') return t('cart.availability.soldOut')
  if (status === 'paused') return t('cart.availability.paused')
  return t('cart.availability.unavailable')
}
