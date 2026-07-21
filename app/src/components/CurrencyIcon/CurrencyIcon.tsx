import { CURRENCY } from '~/lib/currency'
import { Icon } from '~/components/Icon'

// The currency mark. `size` sets it in px, `color` tints it; `className` carries context-specific
// sizing (e.g. the global `ccy-mark` inline size, mkt-modal__diamond, …).
export function CurrencyIcon({ className, size, color }: { className?: string; size?: number; color?: string }) {
  return <Icon name={CURRENCY.iconName} className={className} size={size} color={color} />
}
