import { CURRENCY } from '~/lib/currency'
import { Icon } from '~/components/Icon'

// The currency mark. `className` carries context-specific sizing (card__diamond, mkt-modal__diamond, …).
export function CurrencyIcon({ className }: { className?: string }) {
  return <Icon name={CURRENCY.iconName} className={className} />
}
