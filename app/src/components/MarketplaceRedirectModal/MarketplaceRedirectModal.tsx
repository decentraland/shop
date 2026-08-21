import { useEffect, useRef } from 'react'
import { Icon } from '~/components/Icon'
import { config } from '~/config'
import { t } from '~/intl/i18n'
import bagArt from '~/assets/marketplace-bag.svg'
import * as S from './MarketplaceRedirectModal.styles'

/**
 * The legacy Marketplace's page for one token — where listing a resale still happens.
 *
 * PER ENVIRONMENT, off `config.marketplaceUrl`: a seller sent from the `.zone` Shop has to land on the
 * `.zone` Marketplace, or the token they were just looking at does not exist there.
 *
 * `/contracts/:contractAddress/tokens/:tokenId` is that app's own route for a token (its
 * `modules/routing/locations.ts` `nft()`), and the DETAIL page rather than its `/manage` sibling: the
 * seller arrives to decide and price, not to confirm something already decided here.
 */
export function marketplaceTokenUrl(contractAddress: string, tokenId: string): string {
  return `${config.marketplaceUrl}/contracts/${contractAddress}/tokens/${tokenId}`
}

/**
 * Hand-off before sending a seller out of the Shop to resell a token they hold (Figma 2230:113615).
 *
 * An interstitial rather than a bare link because the destination is ANOTHER APPLICATION: the seller is
 * about to lose the page they were on, and a resale listed over there will not appear in the Shop's own
 * manage view. Saying so first is the difference between a hand-off and a page that simply vanished.
 *
 * CONTINUE is an ANCHOR, not a button with a click handler — so the destination is in the status bar on
 * hover, and cmd/middle-click open it in a new tab like any other link. A seller who wants to keep the
 * Shop open should not have to lose it.
 */
export function MarketplaceRedirectModal({
  contractAddress,
  tokenId,
  onClose
}: {
  contractAddress: string
  tokenId: string
  onClose: () => void
}) {
  const cardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    cardRef.current?.focus()
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <S.Scrim role="presentation" onClick={onClose}>
      <S.Card
        ref={cardRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={t('marketplaceRedirect.title')}
        data-testid="marketplace-redirect-modal"
        onClick={e => e.stopPropagation()}
      >
        <S.Head>
          <S.Title>{t('marketplaceRedirect.title')}</S.Title>
          <S.Close onClick={onClose} aria-label={t('marketplaceRedirect.close')}>
            <Icon name="close" className="ico" />
          </S.Close>
        </S.Head>

        <S.Info>
          <S.BagArt src={bagArt} alt="" aria-hidden />
          <S.InfoTitle>{t('marketplaceRedirect.heading')}</S.InfoTitle>
          <S.InfoText>{t('marketplaceRedirect.body')}</S.InfoText>
        </S.Info>

        <S.Ctas>
          <S.Secondary onClick={onClose} data-testid="marketplace-redirect-cancel">
            {t('marketplaceRedirect.cancel')}
          </S.Secondary>
          <S.Primary
            href={marketplaceTokenUrl(contractAddress, tokenId)}
            target="_blank"
            rel="noreferrer"
            data-testid="marketplace-redirect-continue"
          >
            {t('marketplaceRedirect.continue')}
            <S.PrimaryChevron aria-hidden>
              <Icon name="view-all-arrow" className="ico" />
            </S.PrimaryChevron>
          </S.Primary>
        </S.Ctas>
      </S.Card>
    </S.Scrim>
  )
}
