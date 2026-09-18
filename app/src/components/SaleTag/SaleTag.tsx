import { t } from '~/intl/i18n'
import * as S from './SaleTag.styles'

/** How much is off, as the design draws it. Falls back to the plain word when the cut rounds to nothing. */
export function SaleTag({
  pct,
  size = 'sm',
  className,
  testId
}: {
  pct: number
  /** 'sm' on a card, 'lg' on the item page — the design draws the same tag at two type sizes. */
  size?: 'sm' | 'lg'
  className?: string
  testId?: string
}) {
  return (
    <S.Root className={className} data-size={size} data-testid={testId}>
      {/* Decorative: the number beside it carries the meaning, and a screen reader announcing "fire" does
          not help anyone. */}
      <span aria-hidden>🔥</span>
      <S.Pct>{pct > 0 ? t('assetCard.saleTagPct', { pct }) : t('assetCard.sale')}</S.Pct>
    </S.Root>
  )
}

export default SaleTag
