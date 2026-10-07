import { useEffect, useRef, type ReactNode } from 'react'
import { t, tNode } from '~/intl/i18n'
import { formatCredits } from '~/lib/currency'
import { salePriceOf } from '~/lib/sale'
import { ANNOUNCEMENT_PCT } from '~/lib/discountsAnnouncement'
import type { SaleableCollection } from '~/lib/saleableCollections'
import { CurrencyIcon } from '~/components/CurrencyIcon'
import { Icon } from '~/components/Icon'
import * as S from './DiscountsAnnouncement.styles'

const SHOWN_ITEMS = 3

const bold = (chunks: ReactNode[]) => <b>{chunks}</b>

/** Tells a creator that discounts exist, with one of their own collections priced as buyers would see it on sale. */
export function DiscountsAnnouncement({
  collection,
  onShown,
  onClose,
  onCreate
}: {
  collection: SaleableCollection
  /** Called once it is on screen, which is later than the decision to show it when its chunk is still loading. */
  onShown?: () => void
  onClose: () => void
  onCreate: () => void
}) {
  const cardRef = useRef<HTMLDivElement>(null)
  // Read through a ref so a parent re-rendering with a new callback does not re-run the focus effect.
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const shownRef = useRef(onShown)
  shownRef.current = onShown
  // The priciest first: a 1-credit item rounds any discount away and would show no change at all.
  const items = collection.items
    .filter(item => item.state === 'discounted' && item.priceCredits !== null)
    .sort((a, b) => (b.priceCredits as number) - (a.priceCredits as number))
    .slice(0, SHOWN_ITEMS)

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    cardRef.current?.focus()
    shownRef.current?.()
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        closeRef.current()
        return
      }
      if (e.key !== 'Tab' || !cardRef.current) return
      // Keeps Tab inside the dialog: the page behind it is not reachable while it is open.
      const focusable = cardRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]')
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && (document.activeElement === first || document.activeElement === cardRef.current)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      previous?.focus()
    }
  }, [])

  return (
    <S.Scrim role="presentation" onClick={onClose}>
      <S.Card
        ref={cardRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="discounts-announcement-title"
        data-testid="discounts-announcement"
        onClick={e => e.stopPropagation()}
      >
        <S.Head>
          <S.Eyebrow>
            <span aria-hidden>🔥</span> {t('discountsAnnouncement.eyebrow')}
          </S.Eyebrow>
          <S.Close type="button" onClick={onClose} aria-label={t('discountsAnnouncement.close')}>
            <Icon name="close" size={22} aria-hidden />
          </S.Close>
        </S.Head>

        <S.Title id="discounts-announcement-title">{t('discountsAnnouncement.title')}</S.Title>
        <S.Lead>
          {tNode('discountsAnnouncement.lead', { b: bold, collection: collection.name, pct: ANNOUNCEMENT_PCT })}
        </S.Lead>

        {items.length > 0 ? (
          <S.Strip data-testid="discounts-announcement-items">
            {items.map(item => {
              const price = item.priceCredits as number
              const sale = salePriceOf(price, ANNOUNCEMENT_PCT)
              return (
                <S.Item key={item.key} data-testid="discounts-announcement-item">
                  <S.Media>
                    {item.thumbnail ? <img src={item.thumbnail} alt="" /> : null}
                    {sale < price ? <S.Tag pct={ANNOUNCEMENT_PCT} /> : null}
                  </S.Media>
                  <S.Name>{item.name}</S.Name>
                  <S.Prices>
                    <S.Now>
                      <CurrencyIcon size={14} className="ccy-mark" />
                      {formatCredits(sale)}
                    </S.Now>
                    {sale < price ? <S.Was>{formatCredits(price)}</S.Was> : null}
                  </S.Prices>
                </S.Item>
              )
            })}
          </S.Strip>
        ) : null}

        <S.Steps>
          {(['stepPick', 'stepWhen', 'stepBack'] as const).map((key, i) => (
            <S.Step key={key}>
              <S.StepNumber aria-hidden>{i + 1}</S.StepNumber>
              <span>{tNode(`discountsAnnouncement.${key}`, { b: bold })}</span>
            </S.Step>
          ))}
        </S.Steps>

        <S.Actions>
          <S.ActionBtn variant="white" onClick={onClose} data-testid="discounts-announcement-later">
            {t('discountsAnnouncement.later')}
          </S.ActionBtn>
          <S.ActionBtn variant="red" onClick={onCreate} data-testid="discounts-announcement-create">
            {t('discountsAnnouncement.create')}
            <Icon name="chevron-right" size={22} aria-hidden />
          </S.ActionBtn>
        </S.Actions>
      </S.Card>
    </S.Scrim>
  )
}
