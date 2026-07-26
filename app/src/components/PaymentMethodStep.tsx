import { CurrencyIcon } from '~/components/CurrencyIcon'
import { PaymentCtas } from '~/components/PaymentCtas'
import { CreatorName } from '~/components/CreatorName'
import { Icon } from '~/components/Icon'
import { formatCredits } from '~/lib/currency'
import { manaPerCredit, type PaymentMethod, type PaymentOption } from '~/lib/payment-options'
import { t } from '~/intl/i18n'
import type { CatalogItem } from '~/lib/api'
import * as S from './PaymentMethodStep.styles'

export type { PaymentMethod }

/**
 * The "Choose your payment method" step of the Buy Now flow (Figma 1552-316605). Shown only to buyers
 * who already hold MANA; it lets them settle with credits, with MANA, or with BOTH.
 *
 * The rows are whatever `options` says the buyer's balances actually support (see lib/payment-options):
 * credits alone, credits + MANA for the remainder, and/or MANA alone. Nothing unaffordable is rendered
 * — no greyed dead ends — so every row shown is a payment the buyer can actually complete.
 * Single-select; the caller pre-selects `preferred` (credits first, MANA last).
 */
export function PaymentMethodStep({
  item,
  priceCredits,
  priceCents,
  options,
  priceManaWei,
  onBuy,
  onClose,
  busy = false
}: {
  item: CatalogItem
  priceCredits: number
  /** The item's exact price in cents — spells out what each leg of a split covers. */
  priceCents: number
  /** The offerable options, already filtered + ordered by lib/payment-options. */
  options: PaymentOption[]
  /** What the item costs in MANA right now (0n when unknown) — drives the rate caption. */
  priceManaWei: bigint
  /** Buy with the rail the buyer pressed. */
  onBuy: (method: PaymentMethod) => void
  onClose: () => void
  busy?: boolean
}) {
  const rate = manaPerCredit(priceCents, priceManaWei)
  return (
    <S.Root>
      <S.Head>
        <S.Title>{t('buyModal.choosePayment')}</S.Title>
        <S.Close onClick={onClose} disabled={busy} aria-label={t('buyModal.close')}>
          <Icon name="close" />
        </S.Close>
      </S.Head>

      <S.AssetCard>
        <S.Thumb>{item.thumbnail ? <img src={item.thumbnail} alt="" /> : null}</S.Thumb>
        <S.AssetInfo>
          <div>
            <S.AssetName title={item.name}>{item.name || t('buyModal.itemFallback')}</S.AssetName>
            {item.creator ? (
              <S.AssetBy>
                <CreatorName address={item.creator} />
              </S.AssetBy>
            ) : null}
          </div>
          <S.AssetPrice>
            <CurrencyIcon />
            <span>{formatCredits(priceCredits)}</span>
          </S.AssetPrice>
        </S.AssetInfo>
      </S.AssetCard>

      <PaymentCtas
        options={options}
        totalCents={priceCents}
        onPay={onBuy}
        busy={busy}
        creditsLabel={t('buyModal.buyAsset')}
        rateNote={
          rate != null
            ? t('buyModal.manaRate', { mana: rate.toLocaleString('en', { maximumFractionDigits: 2 }) })
            : null
        }
      />
    </S.Root>
  )
}

export default PaymentMethodStep
