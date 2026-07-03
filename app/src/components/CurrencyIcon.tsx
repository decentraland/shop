import { CURRENCY } from '~/lib/currency'

// The currency mark (the diamond today). Centralized so a rebrand only touches CURRENCY.iconClass +
// its SVG. `className` carries the context-specific sizing (card__diamond, mkt-modal__diamond, ...).
export function CurrencyIcon({ className }: { className?: string }) {
  return <span className={`ico ${CURRENCY.iconClass}${className ? ` ${className}` : ''}`} aria-hidden />
}
