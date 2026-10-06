import { Icon } from '~/components/Icon'
import { t } from '~/intl/i18n'
import { ACTIVITY_LISTINGS_ROUTE } from '~/lib/routes'
import * as S from './CancelledListingsBanner.styles'

/** Site-wide notice that some of the account's listings or offers were taken down and can be put back. */
export function CancelledListingsBanner({
  count,
  kind,
  to = ACTIVITY_LISTINGS_ROUTE,
  onDismiss
}: {
  count: number
  kind: 'listings' | 'offers' | 'mixed'
  to?: string
  onDismiss?: () => void
}) {
  return (
    <S.Root data-testid="cancelled-listings-banner" data-kind={kind} role="status">
      <S.Body>
        <Icon name="refresh" size={24} />
        <S.Text>
          {t(`cancelledListings.banner.lead.${kind}`, { count })}{' '}
          <S.Accent>{t('cancelledListings.banner.accent', { count })}</S.Accent>
        </S.Text>
      </S.Body>
      <S.Actions>
        <S.Cta to={to} data-testid="cancelled-listings-banner-cta">
          {t('cancelledListings.banner.cta')}
        </S.Cta>
        {onDismiss ? (
          <S.Dismiss
            type="button"
            onClick={onDismiss}
            aria-label={t('cancelledListings.banner.dismiss')}
            data-testid="cancelled-listings-banner-dismiss"
          >
            <Icon name="close" size={16} />
          </S.Dismiss>
        ) : null}
      </S.Actions>
    </S.Root>
  )
}
