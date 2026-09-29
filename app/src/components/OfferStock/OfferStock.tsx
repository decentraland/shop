import { t } from '~/intl/i18n'
import * as S from './OfferStock.styles'

/**
 * How much of a limited offer has been taken.
 *
 * `total` is NOT the coupon's own allowance. A coupon covers a whole collection, so its remaining uses can
 * be far larger than what THIS listing can deliver — a thousand uses against a hundred copies left is a
 * hundred. The caller passes the figure already capped (the catalogue resolves it server-side as the lesser
 * of the two), and this draws the scale that figure actually sits on.
 *
 * Renders nothing without a real ceiling to divide by: a bar with no denominator is a decoration.
 */
export function OfferStock({
  claimed,
  total,
  className,
  testId
}: {
  claimed: number
  total: number
  className?: string
  testId?: string
}) {
  if (!Number.isFinite(claimed) || !Number.isFinite(total) || total <= 0) return null

  const taken = Math.min(total, Math.max(0, claimed))
  const pct = Math.round((taken / total) * 100)

  return (
    <S.Root className={className} data-testid={testId}>
      <S.Head>
        <S.Label>{t('offerStock.label')}</S.Label>
        <S.Claimed>{t('offerStock.claimed', { claimed: taken, total })}</S.Claimed>
      </S.Head>
      <S.Track
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={taken}
        aria-label={t('offerStock.claimed', { claimed: taken, total })}
      >
        <S.Fill style={{ width: `${pct}%` }} />
      </S.Track>
      <S.Claimed>{t('offerStock.percent', { pct })}</S.Claimed>
    </S.Root>
  )
}

export default OfferStock
