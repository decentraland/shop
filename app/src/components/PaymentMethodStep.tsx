import { CurrencyIcon } from '~/components/CurrencyIcon'
import { CreatorName } from '~/components/CreatorName'
import { Icon } from '~/components/Icon'
import { formatCredits } from '~/lib/currency'
import { formatMana } from '~/lib/mana-format'
import { creditsFromCents, type PaymentMethod, type PaymentOption } from '~/lib/payment-options'
import { t } from '~/intl/i18n'
import type { CatalogItem } from '~/lib/api'
import manaSymbol from '~/assets/mana-matic.svg'
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
  const creditsBalance = creditsFromCents(balanceCents)

  // Label, marks and amounts per row — one place so the three rows stay visually consistent.
  function rowContent(option: PaymentOption) {
    if (option.method === 'credits') {
      return {
        label: t('buyModal.methodCredits'),
        logo: (
          <S.Logo>
            <CurrencyIcon />
          </S.Logo>
        ),
        balance: (
          <>
            {t('buyModal.creditsBalanceLabel')} <CurrencyIcon />
            <S.BalanceValue>{formatCredits(creditsBalance)}</S.BalanceValue>
          </>
        ),
        price: (
          <S.Price>
            <CurrencyIcon />
            <span>{formatCredits(creditsFromCents(option.creditsCents))}</span>
          </S.Price>
        )
      }
    }
    if (option.method === 'mana') {
      return {
        label: t('buyModal.methodMana'),
        logo: <S.ManaLogo src={manaSymbol} alt="" aria-hidden />,
        balance: (
          <>
            {t('buyModal.manaBalanceLabel')} <S.ManaMini src={manaSymbol} alt="" aria-hidden />
            <S.BalanceValue>{formatMana(manaBalanceWei)}</S.BalanceValue>
          </>
        ),
        price: (
          <S.Price>
            <S.ManaPriceIco src={manaSymbol} alt="" aria-hidden />
            <span>{formatMana(option.manaWei)}</span>
          </S.Price>
        )
      }
    }
    // Combined: the whole credit balance goes first, MANA covers the remainder.
    return {
      label: t('buyModal.methodCombined'),
      logo: (
        <S.DualLogo>
          <CurrencyIcon />
          <img src={manaSymbol} alt="" aria-hidden />
        </S.DualLogo>
      ),
      balance: (
        <>
          {t('buyModal.creditsBalanceLabel')} <CurrencyIcon />
          <S.BalanceValue>{formatCredits(creditsBalance)}</S.BalanceValue>
          <S.Plus>+</S.Plus>
          <S.ManaMini src={manaSymbol} alt="" aria-hidden />
          <S.BalanceValue>{formatMana(manaBalanceWei)}</S.BalanceValue>
        </>
      ),
      price: (
        <S.SplitPrice>
          <CurrencyIcon />
          <span>{formatCredits(creditsFromCents(option.creditsCents))}</span>
          <S.Plus>+</S.Plus>
          <img src={manaSymbol} alt="" aria-hidden />
          <span>{formatMana(option.manaWei)}</span>
        </S.SplitPrice>
      )
    }
  }

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

      <S.Options role="radiogroup" aria-label={t('buyModal.choosePayment')}>
        {options.map(option => {
          const { label, logo, balance, price } = rowContent(option)
          const isSelected = selected === option.method
          return (
            <S.OptionRow
              key={option.method}
              type="button"
              role="radio"
              aria-checked={isSelected}
              data-selected={isSelected}
              data-testid={`pay-with-${option.method}`}
              onClick={() => onSelect(option.method)}
            >
              <S.LeftSlot>
                <S.CheckBox data-checked={isSelected}>{isSelected ? <Icon name="check" /> : null}</S.CheckBox>
              </S.LeftSlot>
              <S.Content>
                <S.InfoGroup>
                  {logo}
                  <S.TextBlock>
                    <S.Label>{label}</S.Label>
                    <S.BalanceRow>{balance}</S.BalanceRow>
                  </S.TextBlock>
                </S.InfoGroup>
                {price}
              </S.Content>
            </S.OptionRow>
          )
        })}
      </S.Options>

      <S.BuyBtn type="button" data-testid="pay-confirm" onClick={onBuy} disabled={busy}>
        {t('buyModal.buy')}
      </S.BuyBtn>
    </S.Root>
  )
}

export default PaymentMethodStep
