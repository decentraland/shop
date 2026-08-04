import { useEffect, useRef, useState } from 'react'
import { Icon } from '~/components/Icon'
import { CreditRate } from '~/components/CreditRate'
import * as F from '~/styles/field.styles'
import { t } from '~/intl/i18n'
import * as S from './NewPricingModal.styles'

/**
 * Prompt shown to a seller entering My Assets with classic (MANA-priced) listings, pointing them at the
 * migration tool. Purely a nudge — MigrateModal is what actually moves the listings.
 *
 * Both callbacks report whether the seller ticked "don't show this again" — the choice stands whichever
 * button closed the prompt — so the caller owns persistence.
 */
export function NewPricingModal({
  onClose,
  onConfirm
}: {
  onClose: (optOut: boolean) => void
  onConfirm: (optOut: boolean) => void
}) {
  const [optOut, setOptOut] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)

  // The opt-out is read through a ref so Escape/scrim handlers don't need re-binding on every tick.
  const optOutRef = useRef(optOut)
  optOutRef.current = optOut

  useEffect(() => {
    cardRef.current?.focus()
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose(optOutRef.current)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <S.Scrim role="presentation" onClick={() => onClose(optOut)}>
      <S.Card
        ref={cardRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={t('newPricing.title')}
        data-testid="new-pricing-modal"
        onClick={e => e.stopPropagation()}
      >
        <S.Head>
          <S.Title>{t('newPricing.title')}</S.Title>
          <S.Close onClick={() => onClose(optOut)} aria-label={t('newPricing.close')}>
            <Icon name="close" className="ico" />
          </S.Close>
        </S.Head>

        <S.Info>
          <S.InfoTitle>{t('newPricing.infoTitle')}</S.InfoTitle>
          <S.InfoText>{t('newPricing.infoBody')}</S.InfoText>
        </S.Info>

        <CreditRate align="center" />

        <S.Foot>
          <S.Ctas>
            <S.Secondary onClick={() => onClose(optOut)} data-testid="new-pricing-later">
              {t('newPricing.later')}
            </S.Secondary>
            <S.Primary onClick={() => onConfirm(optOut)} data-testid="new-pricing-confirm">
              {t('newPricing.confirm')}
            </S.Primary>
          </S.Ctas>

          <S.OptOut>
            <S.OptOutBox>
              <F.Checkbox
                type="checkbox"
                checked={optOut}
                onChange={e => setOptOut(e.target.checked)}
                data-testid="new-pricing-opt-out"
              />
            </S.OptOutBox>
            {t('newPricing.optOut')}
          </S.OptOut>
        </S.Foot>
      </S.Card>
    </S.Scrim>
  )
}
