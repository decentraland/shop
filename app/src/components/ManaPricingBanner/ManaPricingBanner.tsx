import { Icon } from '~/components/Icon'
import { t, tNode } from '~/intl/i18n'
import manaSymbol from '~/assets/mana-matic.svg'
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
          {/* The MANA mark rides the WORD, not a fixed position in the sentence: the message marks it up as
              <mana>MANA</mana> so the pair survives translation. English puts it mid-sentence, Spanish puts
              it last ("precios en MANA"), so a split-the-string-and-render-between approach would have to
              be wrong in one of the two. Non-breaking space, so mark and word can never land on separate
              lines. */}
          {tNode('manaPricingBanner.lead', {
            count,
            mana: chunks => (
              <>
                <S.ManaMark src={manaSymbol} alt="" aria-hidden />
                {'\u00a0'}
                {chunks}
              </>
            )
          })}{' '}
          <S.Accent>{t('manaPricingBanner.accent')}</S.Accent> {t('manaPricingBanner.trail')}
        </S.Text>
      </S.Body>
      <S.Cta to={to} data-testid="mana-pricing-banner-cta">
        {t('manaPricingBanner.cta')}
      </S.Cta>
    </S.Root>
  )
}
