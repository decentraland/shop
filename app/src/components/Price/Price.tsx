import { formatCredits, formatCreditsFull } from '~/lib/currency'
import { useLocale } from '~/store/locale'

/**
 * A credit amount, abbreviated (1B) with the exact grouped value on hover (1,000,000,000).
 *
 * Renders a bare `<span>` so it drops into any existing price wrapper. Subscribing to the locale
 * store here is what makes prices re-render on a language switch — the plain `formatCredits` helper
 * reads the store without subscribing.
 */
export function Price({ credits, className }: { credits: number; className?: string }) {
  const locale = useLocale(s => s.locale)
  return (
    <span className={className} title={formatCreditsFull(credits, locale)}>
      {formatCredits(credits, locale)}
    </span>
  )
}
