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
 * The legacy Marketplace's page for an ITEM, which lists every resale of it.
 *
 * A buyer sent from here has not picked a copy yet — seeing what is on offer is the point of the trip —
 * so this is that app's item route (`locations.item()`), not the single-token route above.
 */
export function marketplaceItemUrl(contractAddress: string, itemId: string): string {
  return `${config.marketplaceUrl}/contracts/${contractAddress}/items/${itemId}`
}

/**
 * Hand-off before sending someone out of the Shop to the legacy Marketplace.
 *
 * An interstitial rather than a bare link because the destination is ANOTHER APPLICATION: the visitor is
 * about to lose the page they were on. Saying so first is the difference between a hand-off and a page
 * that simply vanished.
 *
 * Two directions, because resale lives over there in both:
 *  - `resell` (Figma 2230:113615) — a SELLER listing a token they hold. A resale listed over there will
 *    not appear in the Shop's own manage view, which is the part worth warning about.
 *  - `buy` (Figma 3037:447809) — a BUYER after a copy of an item the Shop cannot sell, because the Shop
 *    only sells primary. The extra warning here is the currency: over there it is MANA, not credits.
 *
 * CONTINUE is an ANCHOR, not a button with a click handler — so the destination is in the status bar on
 * hover, and cmd/middle-click open it in a new tab like any other link. Someone who wants to keep the
 * Shop open should not have to lose it.
 */
type MarketplaceRedirectModalProps = { onClose: () => void } & (
  | { variant?: 'resell'; contractAddress: string; tokenId: string }
  | { variant: 'buy'; contractAddress: string; itemId: string }
)

export function MarketplaceRedirectModal(props: MarketplaceRedirectModalProps) {
  const { contractAddress, onClose } = props
  const isBuy = props.variant === 'buy'
  const href = isBuy
    ? marketplaceItemUrl(contractAddress, props.itemId)
    : marketplaceTokenUrl(contractAddress, props.tokenId)
  const cardRef = useRef<HTMLDivElement>(null)

  /**
   * Read through a ref so the Escape listener is bound ONCE.
   *
   * Callers pass an inline arrow (`onClose={() => setShowResell(false)}`), which is a new function on every
   * render of the page behind this modal — as a dependency it would tear the listener down and rebuild it
   * on each of them. Holding it here keeps the effect independent of the caller's render cadence instead of
   * asking every caller to remember a `useCallback`.
   */
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    cardRef.current?.focus()
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCloseRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

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
          <S.InfoText>{isBuy ? t('marketplaceRedirect.buyBody') : t('marketplaceRedirect.body')}</S.InfoText>
          {isBuy ? <S.InfoText>{t('marketplaceRedirect.buyCurrencyNote')}</S.InfoText> : null}
        </S.Info>

        <S.Ctas>
          <S.Secondary onClick={onClose} data-testid="marketplace-redirect-cancel">
            {t('marketplaceRedirect.cancel')}
          </S.Secondary>
          <S.Primary href={href} target="_blank" rel="noreferrer" data-testid="marketplace-redirect-continue">
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
