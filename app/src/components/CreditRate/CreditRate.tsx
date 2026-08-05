import { CreditMarkIcon } from '~/components/Icons/CreditMarkIcon'
import { CURRENCY, creditsToUsd } from '~/lib/currency'
import { capitalizeFirst } from '~/lib/text'
import { t } from '~/intl/i18n'
import * as S from './CreditRate.styles'

// "◈ 1 Credit = $USD 0.10" — the peg, stated wherever a seller is asked to price in credits. Both
// numbers come from lib/currency so the line can never drift from the actual conversion.
export function CreditRate({
  align,
  tone,
  className
}: {
  align?: 'center'
  /** 'on-dark' is the all-white skin the violet pages need. */
  tone?: 'on-dark'
  className?: string
}) {
  const unit = capitalizeFirst(CURRENCY.nameSingular)
  const usd = creditsToUsd(1).toFixed(2)
  const usdLabel = t('creditRate.usdLabel')

  return (
    <S.Root
      className={className}
      data-align={align}
      data-tone={tone}
      data-testid="credit-rate"
      aria-label={t('creditRate.aria', { unit, usd })}
    >
      <CreditMarkIcon />
      <span>
        <S.Value>1</S.Value> <S.Unit>{unit}</S.Unit>
      </span>
      <S.Equals aria-hidden>{t('creditRate.equals')}</S.Equals>
      <span>
        <S.Unit>{usdLabel}</S.Unit> <S.Value>{usd}</S.Value>
      </span>
    </S.Root>
  )
}
