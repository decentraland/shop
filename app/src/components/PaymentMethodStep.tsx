import { CurrencyIcon } from '~/components/CurrencyIcon'
import { CreatorName } from '~/components/CreatorName'
import { Icon } from '~/components/Icon'
import { formatCredits } from '~/lib/currency'
import { formatMana } from '~/lib/mana'
import { t } from '~/intl/i18n'
import type { CatalogItem } from '~/lib/api'
import * as S from './PaymentMethodStep.styles'

export type PaymentMethod = 'credits' | 'mana'

/**
 * The "Choose your payment method" step (Figma 1552-316605). Shown only to buyers who ALREADY hold
 * MANA — it lets them settle the purchase directly in MANA instead of the default credits rail.
 *
 * Single-select for this iteration (a radio-style choice). Credits is the default and is always
 * affordable here (the modal only reaches this step from the enough-credits branch). The MANA row is
 * greyed + non-selectable when the wallet's MANA doesn't cover the price ("Not enough MANA"), steering
 * the buyer to credits.
 *
 * COMBINED credits + MANA (stretch, NOT built): the checkbox styling is intentional — a future
 * iteration could allow BOTH rows checked and split payment (credits leg + MANA remainder via
 * CreditsManager.useCredits maxUncreditedValue). To wire it: lift `selected` to a Set<PaymentMethod>,
 * allow toggling both, and branch the parent's Buy handler to a combined settlement (see the NOTE in
 * lib/buy-mana.ts). Kept single-select here so the two simple rails ship first.
 */
export function PaymentMethodStep({
  item,
  priceCredits,
  creditsBalance,
  priceManaWei,
  manaBalanceWei,
  manaSufficient,
  selected,
  onSelect,
  onBuy,
  onClose,
  busy = false
}: {
  item: CatalogItem
  priceCredits: number
  creditsBalance: number
  priceManaWei: bigint
  manaBalanceWei: bigint
  manaSufficient: boolean
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

      <S.Options role="radiogroup" aria-label={t('buyModal.choosePayment')}>
        {/* Credits — the default rail (always affordable at this step). */}
        <S.OptionRow
          type="button"
          role="radio"
          aria-checked={selected === 'credits'}
          data-selected={selected === 'credits'}
          onClick={() => onSelect('credits')}
        >
          <S.LeftSlot>
            <S.CheckBox data-checked={selected === 'credits'}>
              {selected === 'credits' ? <Icon name="check" /> : null}
            </S.CheckBox>
          </S.LeftSlot>
          <S.Content>
            <S.InfoGroup>
              <S.Logo>
                <CurrencyIcon />
              </S.Logo>
              <S.TextBlock>
                <S.Label>{t('buyModal.methodCredits')}</S.Label>
                <S.BalanceRow>
                  {t('buyModal.creditsBalanceLabel')} <CurrencyIcon />
                  <S.BalanceValue>{formatCredits(creditsBalance)}</S.BalanceValue>
                </S.BalanceRow>
              </S.TextBlock>
            </S.InfoGroup>
            <S.Price>
              <CurrencyIcon />
              <span>{formatCredits(priceCredits)}</span>
            </S.Price>
          </S.Content>
        </S.OptionRow>

        {/* MANA — direct on-chain settlement; greyed + non-selectable when the balance is short. */}
        <S.OptionRow
          type="button"
          role="radio"
          aria-checked={selected === 'mana'}
          aria-disabled={!manaSufficient}
          data-selected={selected === 'mana'}
          data-disabled={!manaSufficient}
          onClick={() => {
            if (manaSufficient) onSelect('mana')
          }}
        >
          <S.LeftSlot>
            <S.CheckBox data-checked={selected === 'mana'}>
              {selected === 'mana' ? <Icon name="check" /> : null}
            </S.CheckBox>
          </S.LeftSlot>
          <S.Content>
            <S.InfoGroup>
              <S.Logo>
                <Icon name="mana-logo" />
              </S.Logo>
              <S.TextBlock>
                <S.Label>{t('buyModal.methodMana')}</S.Label>
                <S.BalanceRow>
                  {manaSufficient ? (
                    <>
                      {t('buyModal.manaBalanceLabel')} <Icon name="mana-logo" />
                      <S.BalanceValue>{formatMana(manaBalanceWei)}</S.BalanceValue>
                    </>
                  ) : (
                    <S.Hint>{t('buyModal.notEnoughMana')}</S.Hint>
                  )}
                </S.BalanceRow>
              </S.TextBlock>
            </S.InfoGroup>
            <S.Price>
              <Icon name="mana-logo" />
              <span>{formatMana(priceManaWei)}</span>
            </S.Price>
          </S.Content>
        </S.OptionRow>
      </S.Options>

      <S.BuyBtn type="button" onClick={onBuy} disabled={busy}>
        {t('buyModal.buy')}
      </S.BuyBtn>
    </S.Root>
  )
}

export default PaymentMethodStep
