import { CurrencyIcon } from '~/components/CurrencyIcon'
import { theme } from '~/styles/theme'
import { t } from '~/intl/i18n'
import * as S from './ManaPricingBanner.styles'

/** Standing nudge for a seller who still has classic listings, linking to the migration tool. */
export function ManaPricingBanner({
  count,
  to = '/import',
  className
}: {
  count: number
  to?: string
  className?: string
}) {
  return (
    <S.Root className={className} data-testid="mana-pricing-banner">
      <S.Body>
        <CurrencyIcon size={20} color={theme.colors.accent} />
        <S.Text>
          {t('manaPricingBanner.lead', { count })} <S.Accent>{t('manaPricingBanner.accent')}</S.Accent>{' '}
          {t('manaPricingBanner.trail')}
        </S.Text>
      </S.Body>
      <S.Cta to={to} data-testid="mana-pricing-banner-cta">
        {t('manaPricingBanner.cta')}
      </S.Cta>
    </S.Root>
  )
}
