import type { CatalogItem } from '~/lib/api'
import type { CreditPack } from '~/lib/payments'
import { isIapMode } from '~/lib/iap'
import { formatCredits } from '~/lib/currency'
import { hrefFor } from '~/lib/routes'
import { PaymentCtas } from '~/components/PaymentCtas'
import { manaPerCredit, type PaymentMethod, type PaymentOption } from '~/lib/payment-options'
import { t } from '~/intl/i18n'
import { CloseIcon } from '~/components/Icons/CloseIcon'
import { WarningTriangleIcon } from '~/components/Icons/WarningTriangleIcon'
import * as M from '~/components/BuyModal/modal.styles'
import * as S from './CartCheckoutModal.styles'
import loaderLogo from '~/assets/credits/loader-logo.svg'
import packCoin from '~/assets/credits/pack-coin.webp'
import buyErrorAvatar from '~/assets/error/buy-error.png'

// The processing stages (mirrors Cart.tsx): reserve credits per unit → wait for the wallet signature →
// settle the single on-chain tx. Kept as a local union so the modal has no dependency on Cart.
export type CheckoutStage = 'reserving' | 'awaiting-signature' | 'settling'

// A cart line as the modal displays it: the item + the LIVE per-unit credit price + how many units.
export type CheckoutLine = { item: CatalogItem; priceCredits: number; quantity?: number }

// The modal is a PURE presentational view of the checkout flow — all money logic (review, authorize,
// buy, settle, release) stays in Cart.tsx. It renders the multi-item variants of the pixel-perfect
// BuyModal states, reusing the shared modal shell (~/components/BuyModal/modal.styles, imported as M)
// plus a few additions of its own (S: step counter, scrollable list). Mirrors Figma "New Shop 2026":
// 1182-218528 / 1182-219697 / 1182-220275.
// The success/confirmation state is NOT a modal phase anymore — the cart navigates to the standalone
// /success page after purchase (Figma 1182-232376). This modal only covers the in-flight states.
export type CheckoutPhase = 'choose' | 'processing' | 'nofunds' | 'error'

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
  // How many confirmations the basket needs and which one is pending. Only meaningful above 1, and only
  // rendered for self-custody buyers — see Processing.
  signatures?: { current: number; total: number }
  // nofunds
  lines?: CheckoutLine[]
  shortfallCredits?: number
  packs?: CreditPack[]
  selectedPack?: string
  onSelectPack?: (id: string) => void
  onBuyPacks?: () => void
  // choose (payment rails — only when the buyer holds MANA, see lib/payment-options)
  options?: PaymentOption[]
  /** Buy with the rail the buyer pressed (each CTA is the payment — no separate confirm). */
  onPay?: (m: PaymentMethod) => void
  totalCents?: number
  /** What the basket costs in MANA right now (0n when unknown) — drives the rate caption. */
  totalManaWei?: bigint
  totalCredits?: number
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
        : phase === 'choose'
          ? t('buyModal.choosePayment')
          : t('cartCheckout.titleBuy')
  const tall = phase === 'processing'

  return (
    <M.Modal role="dialog" aria-modal="true" aria-label={t('cartCheckout.dialogAria')}>
      <M.Scrim onClick={busy ? undefined : onClose} aria-hidden />
      <M.Card data-tall={tall || undefined}>
        <M.Head>
          <M.HeadRow>
            <M.Title>{title}</M.Title>
            {!busy && (
              <M.X onClick={onClose} aria-label={t('buyModal.close')}>
                <CloseIcon />
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

        {phase === 'choose' && (
          <M.Body>
            {/* The basket total, then one row per payable rail. Each row spells out exactly what it
                charges (and, for a mixed payment, what each leg covers) — see PaymentCtas. */}
            <S.ChooseTotal>
              <span>{t('cart.purchaseSummary')}</span>
              <strong>
                <M.BalanceIco />
                {formatCredits(props.totalCredits ?? 0)}
              </strong>
            </S.ChooseTotal>
            <PaymentCtas
              options={props.options ?? []}
              totalCents={props.totalCents ?? 0}
              onPay={props.onPay ?? (() => {})}
              rateNote={(() => {
                const r = manaPerCredit(props.totalCents ?? 0, props.totalManaWei ?? 0n)
                return r != null
                  ? t('buyModal.manaRate', { mana: r.toLocaleString('en', { maximumFractionDigits: 2 }) })
                  : null
              })()}
            />
          </M.Body>
        )}
        {phase === 'processing' && (
          <Processing
            stage={props.stage ?? 'reserving'}
            step={props.step ?? 1}
            total={props.total ?? 1}
            isSelfCustody={!!props.isSelfCustody}
            signatures={props.signatures}
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
          <M.Body>
            <M.BuyError data-testid="buy-error">
              <M.BuyErrorArt src={buyErrorAvatar} alt="" width={64} height={80} />
              {/*
                A caller-supplied message REPLACES the generic body, keeping the headline that gives the panel
                its shape. The prop was declared and never read, so every failure rendered the same
                "Don't worry, your credits are safe" — including a partial purchase, where credits had in fact
                been spent and an item had already left the cart.
              */}
              <M.BuyErrorText>
                <b>{t('cartCheckout.errorHeadline')}</b> {props.message ?? t('cartCheckout.errorBody')}
              </M.BuyErrorText>
            </M.BuyError>
            <M.Ctas>
              <M.Btn data-variant="outline" onClick={onClose}>
                {t('buyModal.cancel')}
              </M.Btn>
              <M.Btn data-variant="purple" onClick={props.onRetry ?? onClose}>
                {t('cartCheckout.tryAgain')}
              </M.Btn>
            </M.Ctas>
          </M.Body>
        )}
      </M.Card>
    </M.Modal>
  )
}

// Processing (Figma 1182-232610). The flow has three HONEST stages so the bar never claims progress the
// purchase hasn't made:
//  - reserving: the N units' credits are reserved sequentially (silent) → a DETERMINATE bar fills to
//    step/total, with an "n/N" counter when there's more than one unit.
//  - awaiting-signature: a wallet prompt to sign/confirm the purchase → an INDETERMINATE bar (the
//    buyer hasn't acted yet, so showing a near-full bar would be a lie).
//  - settling: the tx confirms on-chain → INDETERMINATE bar, "Completing transaction…".
function Processing({
  stage,
  step,
  total,
  isSelfCustody,
  signatures
}: {
  stage: CheckoutStage
  step: number
  total: number
  isSelfCustody: boolean
  /**
   * How many wallet confirmations this basket needs, and which one is pending. Supplied only when it is
   * more than one, which happens when the basket spans two purchase paths (an offchain trade and a
   * CollectionStore mint cannot share a transaction) or two marketplaces.
   *
   * Shown ONLY to self-custody buyers. A managed-wallet buyer never confirms anything, so telling them
   * about "2 approvals" would invent a step that does not exist for them — the split stays invisible.
   */
  signatures?: { current: number; total: number }
}) {
  const reserving = stage === 'reserving'
  const pct = total > 0 ? Math.min(100, Math.round((step / total) * 100)) : 0
  // Managed (social) users never confirm anything, so they never see a "confirm" prompt — they go
  // straight to "completing". Copy is web2-first: no "wallet"/"transaction" for anyone (see CONVENTIONS).
  const multiSig = isSelfCustody && signatures && signatures.total > 1
  const text =
    stage === 'awaiting-signature'
      ? isSelfCustody
        ? multiSig
          ? t('cartCheckout.confirmMultiple', { current: signatures.current, total: signatures.total })
          : t('buyModal.confirmToContinue')
        : t('buyModal.completingTransaction')
      : stage === 'settling'
        ? t('buyModal.completingTransaction')
        : t('cartCheckout.preparing')
  return (
    <M.Body data-processing>
      <M.Logo src={loaderLogo} alt="" width={61} height={61} />
      <M.ProcessingText>{text}</M.ProcessingText>
      {reserving ? (
        <S.ProgressRow>
          <M.Progress aria-hidden>
            <M.ProgressFill data-step style={{ width: `${pct}%` }} />
          </M.Progress>
          {total > 1 ? (
            <S.Step>
              {step}/{total}
            </S.Step>
          ) : null}
        </S.ProgressRow>
      ) : (
        // Indeterminate: the base ProgressFill is the sliding shimmer (no fixed width).
        <M.Progress aria-hidden>
          <M.ProgressFill />
        </M.Progress>
      )}
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
  const unitCount = lines.reduce((n, l) => n + (l.quantity ?? 1), 0)
  return (
    <M.Body>
      <M.Warning data-testid="nofunds-warning">
        <WarningTriangleIcon />
        <M.WarningText>
          <b>{t('buyModal.insufficientFunds')}</b> {t('buyModal.warningNeedToBuy')}{' '}
          <b>{t('buyModal.warningCreditsAmount', { count: Math.max(0, shortfallCredits) })}</b>{' '}
          {t('buyModal.warningToPurchase', { count: unitCount })}
          {/* Opens the pack picker, so it is an offer to sell credits and goes with them inside the iOS web
              view. The sentence above still states the shortfall. */}
          {isIapMode() ? null : (
            <>
              <br />
              <M.WarningLink href={hrefFor('/credits')} target="_blank" rel="noopener noreferrer">
                {t('buyModal.warningLearnMore')}
              </M.WarningLink>
            </>
          )}
        </M.WarningText>
      </M.Warning>

      <S.Scroll>
        {lines.map(l => {
          const qty = l.quantity ?? 1
          return (
            <M.Asset key={l.item.id}>
              <M.AssetThumb>{l.item.thumbnail ? <img src={l.item.thumbnail} alt="" /> : null}</M.AssetThumb>
              <M.AssetInfo>
                <div>
                  <M.AssetName title={l.item.name}>
                    {l.item.name || t('buyModal.itemFallback')}
                    {qty > 1 ? <S.QtyTag>{t('cartCheckout.qty', { count: qty })}</S.QtyTag> : null}
                  </M.AssetName>
                  {l.item.creator ? <M.AssetCreator address={l.item.creator} /> : null}
                </div>
                <M.AssetPrice>
                  <M.AssetPriceIco />
                  <span>{formatCredits(l.priceCredits * qty)}</span>
                </M.AssetPrice>
              </M.AssetInfo>
            </M.Asset>
          )
        })}
      </S.Scroll>

      {/* The cart's own pack picker — the same sale BuyModal offers, so it is gated the same way. The
          shortfall warning and the line list stay, so the buyer knows what is missing and can close; they
          top up in the app and come back. */}
      {isIapMode() ? null : (
        <>
          <M.Packs>
            {packs.map(p => {
              const on = p.id === selectedPack
              return (
                <M.Pack
                  key={p.id}
                  data-testid="credit-pack"
                  data-on={on || undefined}
                  onClick={() => onSelectPack(p.id)}
                >
                  <M.PackIco src={packCoin} alt="" />
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
        </>
      )}

      <M.Ctas>
        <M.Btn data-variant="outline" onClick={onCancel}>
          {t('buyModal.cancel')}
        </M.Btn>
        {isIapMode() ? null : (
          <M.Btn data-variant="gradient" onClick={onBuyPacks}>
            {t('buyModal.buy')}
          </M.Btn>
        )}
      </M.Ctas>
    </M.Body>
  )
}

export default CartCheckoutModal
