import { CurrencyIcon } from '~/components/CurrencyIcon'
import { PaymentOptionRows } from '~/components/PaymentOptionRows'
import { CreatorName } from '~/components/CreatorName'
import { Icon } from '~/components/Icon'
import { formatCredits } from '~/lib/currency'
import type { PaymentMethod, PaymentOption } from '~/lib/payment-options'
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
  balanceCents,
  manaBalanceWei,
  options,
  selected,
  onSelect,
  onBuy,
  onClose,
  busy = false
}: {
  item: CatalogItem
  priceCredits: number
  /** The item's exact price in cents — spells out what each leg of a split covers. */
  priceCents: number
  /** The buyer's credit balance in cents (shown on the credits / combined rows). */
  balanceCents: number
  /** The buyer's MANA balance in wei (shown on the MANA / combined rows). */
  manaBalanceWei: bigint
  /** The offerable options, already filtered + ordered by lib/payment-options. */
  options: PaymentOption[]
  selected: PaymentMethod
  onSelect: (method: PaymentMethod) => void
  onBuy: () => void
  onClose: () => void
  busy?: boolean
}) {
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

      <PaymentOptionRows
        options={options}
        selected={selected}
        onSelect={onSelect}
        balanceCents={balanceCents}
        manaBalanceWei={manaBalanceWei}
        totalCents={priceCents}
      />

      <S.BuyBtn type="button" data-testid="pay-confirm" onClick={onBuy} disabled={busy}>
        {t('buyModal.buy')}
      </S.BuyBtn>
    </S.Root>
  )
}

export default PaymentMethodStep
