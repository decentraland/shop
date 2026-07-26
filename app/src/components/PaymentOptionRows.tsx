import { CurrencyIcon } from '~/components/CurrencyIcon'
import { Icon } from '~/components/Icon'
import { formatCredits } from '~/lib/currency'
import { formatMana } from '~/lib/mana-format'
import { creditsFromCents, type PaymentMethod, type PaymentOption } from '~/lib/payment-options'
import { t } from '~/intl/i18n'
import manaSymbol from '~/assets/mana-matic.svg'
import * as S from './PaymentMethodStep.styles'

/**
 * The selectable payment-rail rows, shared by the item Buy Now step and the cart checkout so both spell
 * the amounts out identically.
 *
 * Every row states EXACTLY what will be charged:
 *   • credits  — "Credits", the balance, and the credits total being charged.
 *   • mana     — "MANA", the MANA balance, and the MANA total being charged.
 *   • combined — "Credits + MANA", both balances, the split (◈X + Y MANA) as the price, plus a detail
 *                line naming what each leg covers ("◈X of ◈TOTAL · MANA covers the remaining ◈R"), so a
 *                mixed payment is never ambiguous about which side pays what.
 *
 * Only offerable options are passed in (see lib/payment-options), so no row here is a dead end.
 */
export function PaymentOptionRows({
  options,
  selected,
  onSelect,
  balanceCents,
  manaBalanceWei,
  totalCents
}: {
  options: PaymentOption[]
  selected: PaymentMethod
  onSelect: (method: PaymentMethod) => void
  /** The buyer's credit balance in cents. */
  balanceCents: number
  /** The buyer's MANA balance in wei. */
  manaBalanceWei: bigint
  /** What the purchase costs in cents — used to spell out what each leg of a split covers. */
  totalCents: number
}) {
  const creditsBalance = creditsFromCents(balanceCents)

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
        detail: null,
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
        // Spell out the credits equivalent so a MANA price is anchored to the item's real price.
        detail: t('buyModal.manaDetail', {
          mana: formatMana(option.manaWei),
          credits: formatCredits(creditsFromCents(totalCents))
        }),
        price: (
          <S.Price>
            <S.ManaPriceIco src={manaSymbol} alt="" aria-hidden />
            <span>{formatMana(option.manaWei)}</span>
          </S.Price>
        )
      }
    }
    // Combined: the whole credit balance goes first, MANA covers the remainder.
    const remainderCents = Math.max(0, totalCents - option.creditsCents)
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
      detail: t('buyModal.combinedDetail', {
        credits: formatCredits(creditsFromCents(option.creditsCents)),
        total: formatCredits(creditsFromCents(totalCents)),
        mana: formatMana(option.manaWei),
        remainder: formatCredits(creditsFromCents(remainderCents))
      }),
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
    <S.Options role="radiogroup" aria-label={t('buyModal.choosePayment')}>
      {options.map(option => {
        const { label, logo, balance, detail, price } = rowContent(option)
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
                  {detail ? <S.Detail>{detail}</S.Detail> : null}
                </S.TextBlock>
              </S.InfoGroup>
              {price}
            </S.Content>
          </S.OptionRow>
        )
      })}
    </S.Options>
  )
}

export default PaymentOptionRows
