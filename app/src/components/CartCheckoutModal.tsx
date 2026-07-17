import type { CatalogItem } from '~/lib/api'
import type { CreditPack } from '~/lib/payments'
import { CurrencyIcon } from '~/components/CurrencyIcon'
import { formatCredits } from '~/lib/currency'

// A cart line as the modal displays it: the item + the LIVE credit price it will be charged.
export type CheckoutLine = { item: CatalogItem; priceCredits: number }

// The modal is a PURE presentational view of the checkout flow — all money logic (review, authorize,
// buy, settle, release) stays in Cart.tsx. It renders the multi-item variants of the four pixel-perfect
// BuyModal states, reusing the `.buy-modal__*` styling (index.css) plus a few `.cart-checkout__*`
// additions for the pieces a single-item modal doesn't have (step counter, scrollable list, multi-item
// success list). Mirrors Figma "New Shop 2026": 1182-218528 / 1182-219697 / 1182-220275.
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
  const title = phase === 'nofunds' ? 'Buy Credits and Items' : 'Buy Assets'
  const tall = phase === 'processing'

  return (
    <div className="buy-modal" role="dialog" aria-modal="true" aria-label="Check out your cart">
      <div className="buy-modal__scrim" onClick={busy ? undefined : onClose} aria-hidden />
      <div className={`buy-modal__card${tall ? ' buy-modal__card--tall' : ''}`}>
        {showHead && (
          <div className="buy-modal__head">
            <div className="buy-modal__head-row">
              <h2 className="buy-modal__title">{title}</h2>
              {!busy && (
                <button className="buy-modal__x" onClick={onClose} aria-label="Close">
                  <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden>
                    <path d="M4 4l10 10M14 4L4 14" stroke="#161518" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                </button>
              )}
            </div>
            <div className="buy-modal__balance">
              <span className="buy-modal__balance-label">
                {phase === 'nofunds' ? 'DCL Balance:' : 'My Credits Balance:'}
              </span>
              <CurrencyIcon className="buy-modal__balance-ico" />
              <span className="buy-modal__balance-value">{formatCredits(balanceCredits)}</span>
            </div>
          </div>
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
          <div className="buy-modal__body">
            <p className="buy-modal__error">{props.message}</p>
            <div className="buy-modal__ctas">
              <button className="buy-modal__btn buy-modal__btn--gradient" onClick={onClose}>
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// Processing (Figma 1182-218528): logo + "Completing transaction…" + progress bar with an "n/N"
// step counter that advances as each line is authorized.
function Processing({ step, total }: { step: number; total: number }) {
  return (
    <div className="buy-modal__body buy-modal__processing">
      <img className="buy-modal__logo" src="/icon-192.png" alt="" width={61} height={61} />
      <div className="buy-modal__processing-text">Completing transaction…</div>
      <div className="cart-checkout__progress-row">
        <div className="buy-modal__progress" aria-hidden>
          <span className="buy-modal__progress-fill" />
        </div>
        <span className="cart-checkout__step">
          {step}/{total}
        </span>
      </div>
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
  onCancel,
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
    <div className="buy-modal__body">
      <div className="buy-modal__warning">
        <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden className="buy-modal__warning-ico">
          <path d="M12 3L2 20h20L12 3z" fill="none" stroke="#691fa9" strokeWidth="1.8" strokeLinejoin="round" />
          <path d="M12 9v5" stroke="#691fa9" strokeWidth="1.8" strokeLinecap="round" />
          <circle cx="12" cy="17" r="1.1" fill="#691fa9" />
        </svg>
        <p className="buy-modal__warning-text">
          <b>Insufficient Funds.</b> You will need to buy <b>{Math.max(0, shortfallCredits)} Credits</b> to purchase
          {lines.length === 1 ? ' this item.' : ' these items.'}
        </p>
      </div>

      <div className="cart-checkout__scroll">
        {lines.map(l => (
          <div className="buy-modal__asset" key={l.item.id}>
            <div className="buy-modal__asset-thumb">
              {l.item.thumbnail ? <img src={l.item.thumbnail} alt="" /> : null}
            </div>
            <div className="buy-modal__asset-info">
              <div>
                <div className="buy-modal__asset-name" title={l.item.name}>
                  {l.item.name || 'Item'}
                </div>
                {l.item.creator ? <div className="buy-modal__asset-creator">By {l.item.creator}</div> : null}
              </div>
              <div className="buy-modal__asset-price">
                <CurrencyIcon className="buy-modal__asset-price-ico" />
                <span>{formatCredits(l.priceCredits)}</span>
              </div>
            </div>
          </div>
        ))}
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
          Cancel
        </button>
        <button className="buy-modal__btn buy-modal__btn--gradient" onClick={onBuyPacks}>
          Buy
        </button>
      </div>
    </div>
  )
}

// Purchase complete (Figma 1182-220275): green banner + a multi-item list of what was bought + the
// My Assets / Try in world CTAs.
function Complete({
  purchased,
  onMyAssets,
  onTryInWorld,
}: {
  purchased: CatalogItem[]
  onMyAssets: () => void
  onTryInWorld: () => void
}) {
  return (
    <div className="buy-modal__body cart-checkout__done-body">
      <div className="buy-modal__success">
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
        <p className="buy-modal__success-text">
          <b>Your purchase was successful!</b> You can find your item in the My Assets tab.
        </p>
      </div>

      <div className="cart-checkout__done">
        <div className="cart-checkout__done-scroll">
          {purchased.map(item => (
            <div className="cart-checkout__done-row" key={item.id}>
              <div className="cart-checkout__done-thumb">
                {item.thumbnail ? <img src={item.thumbnail} alt="" /> : null}
                <span className="cart-checkout__done-check" aria-hidden>
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
                </span>
              </div>
              <div className="cart-checkout__done-info">
                <div className="cart-checkout__done-name" title={item.name}>
                  {item.name || 'Item'}
                </div>
                {item.creator ? <div className="cart-checkout__done-creator">By {item.creator}</div> : null}
              </div>
              <div className="cart-checkout__done-price">
                <CurrencyIcon className="cart-checkout__done-price-ico" />
                <span>{formatCredits(item.priceCredits)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="buy-modal__ctas">
        <button className="buy-modal__btn buy-modal__btn--outline" onClick={onMyAssets}>
          My assets
        </button>
        <button className="buy-modal__btn buy-modal__btn--ruby" onClick={onTryInWorld}>
          Try in world
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
        </button>
      </div>
    </div>
  )
}

export default CartCheckoutModal
