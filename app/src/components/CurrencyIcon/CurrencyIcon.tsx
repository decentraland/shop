import { CURRENCY } from '~/lib/currency'
import { Icon } from '~/components/Icon'

// The currency mark. `size` sets it in px; `className` carries context-specific sizing (mkt-modal__diamond, …).
export function CurrencyIcon({ className, size }: { className?: string; size?: number }) {
  return <Icon name={CURRENCY.iconName} className={className} size={size} />
}
