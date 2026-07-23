import type { CatalogItem } from '~/lib/api'
import type { CreditPack } from '~/lib/payments'
import { CurrencyIcon } from '~/components/CurrencyIcon'
import { CreatorName } from '~/components/CreatorName'
import { WarningIcon } from '~/components/WarningIcon'
import { formatCredits } from '~/lib/currency'
import { t } from '~/intl/i18n'
import loaderLogo from '~/assets/credits/loader-logo.svg'
import buyErrorAvatar from '~/assets/error/buy-error.png'

// The processing stages (mirrors Cart.tsx): reserve credits per unit → wait for the wallet signature
// → settle the single on-chain tx. Kept as a local union so the modal has no dependency on Cart.
export type CheckoutStage = 'reserving' | 'awaiting-signature' | 'settling'

// A cart line as the modal displays it: the item + the LIVE per-unit credit price + how many units.
export type CheckoutLine = { item: CatalogItem; priceCredits: number; quantity?: number }

// The modal is a PURE presentational view of the checkout flow — all money logic (review, authorize,
// buy, settle, release) stays in Cart.tsx. It renders the multi-item variants of the four pixel-perfect
// BuyModal states, reusing the `.buy-modal__*` styling (index.css) plus a few `.cart-checkout__*`
// additions for the pieces a single-item modal doesn't have (step counter, scrollable list, multi-item
// success list). Mirrors Figma "New Shop 2026": 1182-218528 / 1182-219697 / 1182-220275.
// The success/confirmation state is NOT a modal phase anymore — the cart navigates to the standalone
// /success page after purchase (Figma 1182-232376). This modal only covers the in-flight states.
export type CheckoutPhase = 'processing' | 'nofunds' | 'error'

type Props = {
  phase: CheckoutPhase
  balanceCredits: number
  onClose: () => void
  // processing
  stage?: CheckoutStage
  step?: number
  total?: number
  // Self-custody (MetaMask etc.) users get a "confirm to continue" prompt; managed (social) users sign
  // transparently, so they never see a confirmation step. Never leak "wallet/transaction" — see CONVENTIONS.
  isSelfCustody?: boolean
  // nofunds
  lines?: CheckoutLine[]
  shortfallCredits?: number
  packs?: CreditPack[]
  selectedPack?: string
  onSelectPack?: (id: string) => void
  onBuyPacks?: () => void
  // error
  message?: string | null
  onRetry?: () => void
}

export function CartCheckoutModal(props: Props) {
  const { phase, balanceCredits, onClose } = props
  const busy = phase === 'processing'
  const title =
    phase === 'error'
      ? t('cartCheckout.errorTitle')
      : phase === 'nofunds'
        ? t('cartCheckout.titleNoFunds')
        : t('cartCheckout.titleBuy')
  const tall = phase === 'processing'

  return (
    <div className="buy-modal" role="dialog" aria-modal="true" aria-label={t('cartCheckout.dialogAria')}>
      <div className="buy-modal__scrim" onClick={busy ? undefined : onClose} aria-hidden />
      <div className={`buy-modal__card${tall ? ' buy-modal__card--tall' : ''}`}>
        <div className="buy-modal__head">
          <div className="buy-modal__head-row">
            <h2 className="buy-modal__title">{title}</h2>
            {!busy && (
              <button className="buy-modal__x" onClick={onClose} aria-label={t('buyModal.close')}>
                <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden>
                  <path d="M4 4l10 10M14 4L4 14" stroke="#161518" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </button>
            )}
          </div>
          <div className="buy-modal__balance">
            <span className="buy-modal__balance-label">
              {phase === 'nofunds' ? t('buyModal.dclBalance') : t('buyModal.myCreditsBalance')}
            </span>
            <CurrencyIcon className="buy-modal__balance-ico" />
            <span className="buy-modal__balance-value">{formatCredits(balanceCredits)}</span>
          </div>
        </div>

        {phase === 'processing' && (
          <Processing
            stage={props.stage ?? 'reserving'}
            step={props.step ?? 1}
            total={props.total ?? 1}
            isSelfCustody={!!props.isSelfCustody}
          />
        )}
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
        {phase === 'error' && (
          <div className="buy-modal__body">
            {/* Figma 1182-196586: pink panel + sad-robot art + reassuring copy, then Cancel / Try again. */}
            <div className="buy-error">
              <img className="buy-error__art" src={buyErrorAvatar} alt="" width={64} height={80} />
              <p className="buy-error__text">
                <b>{t('cartCheckout.errorHeadline')}</b> {t('cartCheckout.errorBody')}
              </p>
            </div>
            <div className="buy-modal__ctas">
              <button className="buy-modal__btn buy-modal__btn--outline" onClick={onClose}>
                {t('buyModal.cancel')}
              </button>
              <button className="buy-modal__btn buy-modal__btn--purple" onClick={props.onRetry ?? onClose}>
                {t('cartCheckout.tryAgain')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// Processing (Figma 1182-232610). The flow has three HONEST stages so the bar never claims progress
// the purchase hasn't made:
//  - reserving: the N units' credits are reserved sequentially (silent) → a DETERMINATE bar fills to
//    step/total, with an "n/N" counter when there's more than one unit.
//  - awaiting-signature: ONE wallet prompt to sign/confirm the purchase → an INDETERMINATE bar (the
//    buyer hasn't acted yet, so showing a near-full bar would be a lie).
//  - settling: the single tx confirms on-chain → INDETERMINATE bar, "Completing transaction…".
function Processing({
  stage,
  step,
  total,
  isSelfCustody
}: {
  stage: CheckoutStage
  step: number
  total: number
  isSelfCustody: boolean
}) {
  const reserving = stage === 'reserving'
  const pct = total > 0 ? Math.min(100, Math.round((step / total) * 100)) : 0
  // Managed (social) users never confirm anything, so they never see a "confirm" prompt — they go
  // straight to "completing". Copy is web2-first: no "wallet"/"transaction" for anyone (see CONVENTIONS).
  const text =
    stage === 'awaiting-signature'
      ? isSelfCustody
        ? t('buyModal.confirmToContinue')
        : t('buyModal.completingTransaction')
      : stage === 'settling'
        ? t('buyModal.completingTransaction')
        : t('cartCheckout.preparing')
  return (
    <div className="buy-modal__body buy-modal__processing">
      <img className="buy-modal__logo" src={loaderLogo} alt="" width={61} height={61} />
      <div className="buy-modal__processing-text">{text}</div>
      {reserving ? (
        <div className="cart-checkout__progress-row">
          <div className="buy-modal__progress" aria-hidden>
            <span className="buy-modal__progress-fill buy-modal__progress-fill--step" style={{ width: `${pct}%` }} />
          </div>
          {total > 1 ? (
            <span className="cart-checkout__step">
              {step}/{total}
            </span>
          ) : null}
        </div>
      ) : (
        // Indeterminate: the base .buy-modal__progress-fill is the sliding shimmer (no fixed width).
        <div className="buy-modal__progress" aria-hidden>
          <span className="buy-modal__progress-fill" />
        </div>
      )}
    </div>
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
  const unitCount = lines.reduce((n, l) => n + (l.quantity ?? 1), 0)
  return (
    <div className="buy-modal__body">
      <div className="buy-modal__warning">
        <WarningIcon className="buy-modal__warning-ico" />
        <p className="buy-modal__warning-text">
          <b>{t('buyModal.insufficientFunds')}</b> {t('buyModal.warningNeedToBuy')}{' '}
          <b>{t('buyModal.warningCreditsAmount', { count: Math.max(0, shortfallCredits) })}</b>{' '}
          {t('buyModal.warningToPurchase', { count: unitCount })}
        </p>
      </div>

      <div className="cart-checkout__scroll">
        {lines.map(l => {
          const qty = l.quantity ?? 1
          return (
            <div className="buy-modal__asset" key={l.item.id}>
              <div className="buy-modal__asset-thumb">
                {l.item.thumbnail ? <img src={l.item.thumbnail} alt="" /> : null}
              </div>
              <div className="buy-modal__asset-info">
                <div>
                  <div className="buy-modal__asset-name" title={l.item.name}>
                    {l.item.name || t('buyModal.itemFallback')}
                    {qty > 1 ? (
                      <span className="cart-checkout__qty-tag">{t('cartCheckout.qty', { count: qty })}</span>
                    ) : null}
                  </div>
                  {l.item.creator ? (
                    <CreatorName address={l.item.creator} className="buy-modal__asset-creator" />
                  ) : null}
                </div>
                <div className="buy-modal__asset-price">
                  <CurrencyIcon className="buy-modal__asset-price-ico" />
                  <span>{formatCredits(l.priceCredits * qty)}</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="buy-modal__packs">
        {packs.map(p => {
          const on = p.id === selectedPack
          return (
            <button
              key={p.id}
              className={`buy-modal__pack${on ? ' buy-modal__pack--on' : ''}`}
              onClick={() => onSelectPack(p.id)}
            >
              <CurrencyIcon className="buy-modal__pack-ico" />
              <span className="buy-modal__pack-amount">{formatCredits(p.credits)}</span>
              <span className="buy-modal__pack-usd">(${p.usd.toFixed(2)})</span>
            </button>
          )
        })}
      </div>

      <div className="buy-modal__total">
        <div className="buy-modal__total-credits">
          <CurrencyIcon className="buy-modal__total-ico" />
          <span>{formatCredits(pack?.credits ?? 0)}</span>
        </div>
        <span className="buy-modal__total-usd">${(pack?.usd ?? 0).toFixed(2)}</span>
      </div>

      <div className="buy-modal__ctas">
        <button className="buy-modal__btn buy-modal__btn--outline" onClick={onCancel}>
          {t('buyModal.cancel')}
        </button>
        <button className="buy-modal__btn buy-modal__btn--gradient" onClick={onBuyPacks}>
          {t('buyModal.buy')}
        </button>
      </div>
    </div>
  )
}

export default CartCheckoutModal
