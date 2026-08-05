import { Icon } from '~/components/Icon'
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
        {/* The re-pricing glyph, not the currency mark: what the banner offers is an update, and the
            credits mark is what the prices it is talking about are already shown in. */}
        <Icon name="refresh" size={24} />
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
