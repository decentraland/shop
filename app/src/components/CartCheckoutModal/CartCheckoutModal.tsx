import type { CatalogItem } from '~/lib/api'
import type { CreditPack } from '~/lib/payments'
import { formatCredits } from '~/lib/currency'
import { t } from '~/intl/i18n'
import { ErrorNotice } from '~/components/ErrorNotice'
import * as M from '~/components/BuyModal/modal.styles'
import * as S from './CartCheckoutModal.styles'

// A cart line as the modal displays it: the item + the LIVE credit price it will be charged.
export type CheckoutLine = { item: CatalogItem; priceCredits: number }

// The modal is a PURE presentational view of the checkout flow — all money logic (review, authorize,
// buy, settle, release) stays in Cart.tsx. It renders the multi-item variants of the four pixel-perfect
// BuyModal states, reusing the shared modal shell (~/components/BuyModal/modal.styles, imported as M)
// plus a few additions of its own (S: step counter, scrollable list, multi-item success list). Mirrors
// Figma "New Shop 2026": 1182-218528 / 1182-219697 / 1182-220275.
export type CheckoutPhase = 'processing' | 'nofunds' | 'complete' | 'error'

type Props = {
  phase: CheckoutPhase
  balanceCredits: number
  onClose: () => void
  // processing
  step?: number
  total?: number
  // nofunds
  lines?: CheckoutLine[]
  shortfallCredits?: number
  packs?: CreditPack[]
  selectedPack?: string
  onSelectPack?: (id: string) => void
  onBuyPacks?: () => void
  // complete
  purchased?: CatalogItem[]
  onMyAssets?: () => void
  onTryInWorld?: () => void
  // error
  message?: string | null
}

export function CartCheckoutModal(props: Props) {
  const { phase, balanceCredits, onClose } = props
  const busy = phase === 'processing'
  // The success state has no header in Figma (1182-220275) — just the green banner + list + CTAs.
  const showHead = phase !== 'complete'
  const title = phase === 'nofunds' ? t('cartCheckout.titleNoFunds') : t('cartCheckout.titleBuy')
  const tall = phase === 'processing'

  return (
    <M.Modal role="dialog" aria-modal="true" aria-label={t('cartCheckout.dialogAria')}>
      <M.Scrim onClick={busy ? undefined : onClose} aria-hidden />
      <M.Card data-tall={tall || undefined}>
        {showHead && (
          <M.Head>
            <M.HeadRow>
              <M.Title>{title}</M.Title>
              {!busy && (
                <M.X onClick={onClose} aria-label={t('buyModal.close')}>
                  <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden>
                    <path d="M4 4l10 10M14 4L4 14" stroke="#161518" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                </M.X>
              )}
            </M.HeadRow>
            <M.Balance>
              <M.BalanceLabel>
                {phase === 'nofunds' ? t('buyModal.dclBalance') : t('buyModal.myCreditsBalance')}
              </M.BalanceLabel>
              <M.BalanceIco />
              <M.BalanceValue>{formatCredits(balanceCredits)}</M.BalanceValue>
            </M.Balance>
          </M.Head>
        )}

        {phase === 'processing' && <Processing step={props.step ?? 1} total={props.total ?? 1} />}
        {phase === 'nofunds' && (
          <NoFunds
            lines={props.lines ?? []}
            shortfallCredits={props.shortfallCredits ?? 0}
            packs={props.packs ?? []}
            selectedPack={props.selectedPack ?? ''}
            onSelectPack={props.onSelectPack ?? (() => {})}
            onBuyPacks={props.onBuyPacks ?? (() => {})}
            onCancel={onClose}
          />
        )}
        {phase === 'complete' && (
          <Complete
            purchased={props.purchased ?? []}
            onMyAssets={props.onMyAssets ?? onClose}
            onTryInWorld={props.onTryInWorld ?? onClose}
          />
        )}
        {phase === 'error' && (
          <M.Body>
            <ErrorNotice message={props.message} />
            <M.Ctas>
              <M.Btn data-variant="gradient" onClick={onClose}>
                {t('buyModal.close')}
              </M.Btn>
            </M.Ctas>
          </M.Body>
        )}
      </M.Card>
    </M.Modal>
  )
}

// Processing (Figma 1182-218528): logo + "Completing transaction…" + progress bar with an "n/N"
// step counter that advances as each line is authorized.
function Processing({ step, total }: { step: number; total: number }) {
  return (
    <M.Body data-processing>
      <M.Logo src="/icon-192.png" alt="" width={61} height={61} />
      <M.ProcessingText>{t('buyModal.completingTransaction')}</M.ProcessingText>
      <S.ProgressRow>
        <M.Progress aria-hidden>
          <M.ProgressFill />
        </M.Progress>
        <S.Step>
          {step}/{total}
        </S.Step>
      </S.ProgressRow>
    </M.Body>
  )
}

// Insufficient funds (Figma 1182-219697): warning banner + scrollable line list + pack picker + total
// + Cancel/Buy. Same top-up-then-resume logic as the PDP, driven from Cart.tsx.
function NoFunds({
  lines,
  shortfallCredits,
  packs,
  selectedPack,
  onSelectPack,
  onBuyPacks,
  onCancel
}: {
  lines: CheckoutLine[]
  shortfallCredits: number
  packs: CreditPack[]
  selectedPack: string
  onSelectPack: (id: string) => void
  onBuyPacks: () => void
  onCancel: () => void
}) {
  const pack = packs.find(p => p.id === selectedPack)
  return (
    <M.Body>
      <M.Warning>
        <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden>
          <path d="M12 3L2 20h20L12 3z" fill="none" stroke="#691fa9" strokeWidth="1.8" strokeLinejoin="round" />
          <path d="M12 9v5" stroke="#691fa9" strokeWidth="1.8" strokeLinecap="round" />
          <circle cx="12" cy="17" r="1.1" fill="#691fa9" />
        </svg>
        <M.WarningText>
          <b>{t('buyModal.insufficientFunds')}</b> {t('buyModal.warningNeedToBuy')}{' '}
          <b>{t('buyModal.warningCreditsAmount', { count: Math.max(0, shortfallCredits) })}</b>{' '}
          {t('buyModal.warningToPurchase', { count: lines.length })}
        </M.WarningText>
      </M.Warning>

      <S.Scroll>
        {lines.map(l => (
          <M.Asset key={l.item.id}>
            <M.AssetThumb>{l.item.thumbnail ? <img src={l.item.thumbnail} alt="" /> : null}</M.AssetThumb>
            <M.AssetInfo>
              <div>
                <M.AssetName title={l.item.name}>{l.item.name || t('buyModal.itemFallback')}</M.AssetName>
                {l.item.creator ? (
                  <M.AssetCreator>{t('search.byCreator', { name: l.item.creator })}</M.AssetCreator>
                ) : null}
              </div>
              <M.AssetPrice>
                <M.AssetPriceIco />
                <span>{formatCredits(l.priceCredits)}</span>
              </M.AssetPrice>
            </M.AssetInfo>
          </M.Asset>
        ))}
      </S.Scroll>

      <M.Packs>
        {packs.map(p => {
          const on = p.id === selectedPack
          return (
            <M.Pack key={p.id} data-on={on || undefined} onClick={() => onSelectPack(p.id)}>
              <M.PackIco />
              <M.PackAmount>{formatCredits(p.credits)}</M.PackAmount>
              <M.PackUsd>(${p.usd.toFixed(2)})</M.PackUsd>
            </M.Pack>
          )
        })}
      </M.Packs>

      <M.Total>
        <M.TotalCredits>
          <M.TotalIco />
          <span>{formatCredits(pack?.credits ?? 0)}</span>
        </M.TotalCredits>
        <M.TotalUsd>${(pack?.usd ?? 0).toFixed(2)}</M.TotalUsd>
      </M.Total>

      <M.Ctas>
        <M.Btn data-variant="outline" onClick={onCancel}>
          {t('buyModal.cancel')}
        </M.Btn>
        <M.Btn data-variant="gradient" onClick={onBuyPacks}>
          {t('buyModal.buy')}
        </M.Btn>
      </M.Ctas>
    </M.Body>
  )
}

// Purchase complete (Figma 1182-220275): green banner + a multi-item list of what was bought + the
// My Assets / Try in world CTAs.
function Complete({
  purchased,
  onMyAssets,
  onTryInWorld
}: {
  purchased: CatalogItem[]
  onMyAssets: () => void
  onTryInWorld: () => void
}) {
  return (
    <S.DoneBody>
      <M.Success data-wide>
        <svg viewBox="0 0 64 64" width="60" height="60" aria-hidden>
          <circle cx="32" cy="32" r="32" fill="#34ce77" />
          <path
            d="M20 33l8 8 16-18"
            fill="none"
            stroke="#fff"
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <M.SuccessText data-wide>
          <b>{t('getCredits.successTitle')}</b> {t('buyModal.successBody')}
        </M.SuccessText>
      </M.Success>

      <S.Done>
        <S.DoneScroll>
          {purchased.map(item => (
            <S.DoneRow key={item.id}>
              <S.DoneThumb>
                {item.thumbnail ? <img src={item.thumbnail} alt="" /> : null}
                <S.DoneCheck aria-hidden>
                  <svg viewBox="0 0 18 18" width="12" height="12">
                    <path
                      d="M4 9l3.5 3.5L14 5"
                      fill="none"
                      stroke="#fff"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </S.DoneCheck>
              </S.DoneThumb>
              <S.DoneInfo>
                <S.DoneName title={item.name}>{item.name || t('buyModal.itemFallback')}</S.DoneName>
                {item.creator ? <S.DoneCreator>{t('search.byCreator', { name: item.creator })}</S.DoneCreator> : null}
              </S.DoneInfo>
              <S.DonePrice>
                <S.DonePriceIco />
                <span>{formatCredits(item.priceCredits)}</span>
              </S.DonePrice>
            </S.DoneRow>
          ))}
        </S.DoneScroll>
      </S.Done>

      <M.Ctas>
        <M.Btn data-variant="outline" onClick={onMyAssets}>
          {t('buyModal.myAssets')}
        </M.Btn>
        <M.Btn data-variant="ruby" onClick={onTryInWorld}>
          {t('buyModal.tryInWorld')}
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
            <path
              d="M5 12h12M13 7l5 5-5 5"
              fill="none"
              stroke="#fcfcfc"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </M.Btn>
      </M.Ctas>
    </S.DoneBody>
  )
}

export default CartCheckoutModal
