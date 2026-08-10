import { useEffect, useState } from 'react'
import { CurrencyIcon } from '~/components/CurrencyIcon'
import { CreatorName } from '~/components/CreatorName'
import { Icon } from '~/components/Icon'
import { CURRENCY, formatCredits, usdCentsToCredits } from '~/lib/currency'
import { formatMana } from '~/lib/mana-format'
import { type PaymentMethod, type PaymentOption } from '~/lib/payment-options'
import { t } from '~/intl/i18n'
import type { CatalogItem } from '~/lib/api'
import creditsCoin from '~/assets/payment/credits-coin.webp'
import manaLogo from '~/assets/payment/mana-logo.webp'
// The row's big mark is the DCL logo; the small marks beside a MANA *amount* are the Polygon MANA coin.
import manaCoin from '~/assets/mana-matic.svg'
import * as S from './PaymentMethodStep.styles'

export type { PaymentMethod }

/**
 * "Choose your payment method" — the Buy Now flow's payment step (Figma node 1654-371913).
 *
 * Two SELECTABLE rows (credits, MANA) and one BUY confirm. The design uses CHECKBOXES rather than radio
 * buttons, and that is load-bearing: ticking both is how a buyer pays with credits AND MANA together. So
 * the selection is a set, mapped onto the rails lib/payment-options computed:
 *
 *   {credits}        → 'credits'   — the whole price from the credit balance
 *   {mana}           → 'mana'      — the whole price in MANA, spending no credits
 *   {credits, mana}  → 'combined'  — the credit balance first, MANA covers the remainder
 *
 * A rail that can't pay is shown DISABLED with the reason, never hidden: the balances are on screen, so a
 * silently missing option reads as a bug. The reason is always the shortfall itself — this app never
 * quotes what a MANA balance is worth in credits.
 *
 * Confirm stays disabled until the ticked set is a rail that can settle, so nothing on screen can be
 * submitted into a failure.
 */
export function PaymentMethodStep({
  item,
  priceCredits,
  priceCents,
  options,
  priceManaWei,
  balanceCredits,
  manaBalanceWei,
  onBuy,
  onClose,
  busy = false,
  notice
}: {
  item: CatalogItem
  priceCredits: number
  /** The item's exact price in cents — what each leg of a split is derived from. */
  priceCents: number
  /** The offerable options, already filtered + ordered by lib/payment-options. */
  options: PaymentOption[]
  /** What the item costs in MANA right now (0n when unknown) — the MANA amount + rate caption. */
  priceManaWei: bigint
  /** The buyer's credit balance, for the row's "Credits Balance:" line. */
  balanceCredits: number
  /** The buyer's MANA balance in wei, for the row's "MANA Balance:" line. */
  manaBalanceWei: bigint
  /** Buy with the rail the buyer confirmed. */
  onBuy: (method: PaymentMethod) => void
  onClose: () => void
  busy?: boolean
  /** Something the buyer must read before confirming — rendered above the confirm button. */
  notice?: string | null
}) {
  const credits = options.find(o => o.method === 'credits') ?? null
  const mana = options.find(o => o.method === 'mana') ?? null
  const combined = options.find(o => o.method === 'combined') ?? null

  // Which rails the buyer has ticked. Seeded from what is payable, preferring credits — the mixed rail is
  // only the preselection when neither single rail covers the price on its own.
  const [picked, setPicked] = useState<Set<'credits' | 'mana'>>(() => {
    if (credits) return new Set<'credits' | 'mana'>(['credits'])
    if (combined) return new Set<'credits' | 'mana'>(['credits', 'mana'])
    if (mana) return new Set<'credits' | 'mana'>(['mana'])
    return new Set<'credits' | 'mana'>()
  })

  const creditsUsable = !!credits || !!combined
  const manaUsable = !!mana || !!combined

  // The rails are recomputed as balances and prices resolve; drop a tick that stopped being payable so
  // confirm can never submit a selection the money no longer supports.
  useEffect(() => {
    setPicked(prev => {
      const next = new Set(prev)
      if (next.has('credits') && !creditsUsable) next.delete('credits')
      if (next.has('mana') && !manaUsable) next.delete('mana')
      return next.size === prev.size ? prev : next
    })
  }, [creditsUsable, manaUsable])

  /** The rail a ticked set settles as, or null when the combination isn't payable. */
  const hasC = picked.has('credits')
  const hasM = picked.has('mana')
  const method: PaymentMethod | null =
    hasC && hasM
      ? combined
        ? 'combined'
        : null
      : hasC
        ? credits
          ? 'credits'
          : null
        : hasM
          ? mana
            ? 'mana'
            : null
          : null

  // What each row charges. On the mixed rail the legs differ from the single-rail ones, so they come from
  // the option the CURRENT selection resolves to — each row states its own leg, never the full price twice.
  // Taken from the option, which knows whether its cents are a price or a balance. The fallback is a PRICE
  // — the only case with no option to read is the credits rail not being offered at all.
  const creditsLegDisplay =
    method === 'combined' && combined ? combined.credits : (credits?.credits ?? usdCentsToCredits(priceCents))
  const manaLeg = method === 'combined' && combined ? combined.manaWei : (mana?.manaWei ?? priceManaWei)

  function toggle(rail: 'credits' | 'mana') {
    setPicked(prev => {
      const next = new Set(prev)
      if (next.has(rail)) next.delete(rail)
      else next.add(rail)
      return next
    })
  }

  return (
    <S.Root>
      <S.Head>
        <S.Title>{t('buyModal.choosePayment')}</S.Title>
        <S.Close onClick={onClose} disabled={busy} aria-label={t('buyModal.close')}>
          <Icon name="close" className="ico" />
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

      <S.Options>
        <S.OptionRow
          type="button"
          data-testid="pay-with-credits"
          data-selected={hasC}
          data-disabled={!creditsUsable}
          disabled={busy || !creditsUsable}
          aria-pressed={hasC}
          onClick={() => toggle('credits')}
        >
          <S.LeftSlot>
            <S.CheckBox data-checked={hasC}>
              <Icon name="check" className="ico" />
            </S.CheckBox>
          </S.LeftSlot>
          <S.Content>
            <S.InfoGroup>
              <S.Logo>
                <S.RailArt src={creditsCoin} w={32.582} h={34.401} alt="" aria-hidden />
              </S.Logo>
              <S.TextBlock>
                <S.Label>{CURRENCY.name}</S.Label>
                <S.BalanceRow>
                  {t('buyModal.creditsBalanceLabel')}
                  <CurrencyIcon />
                  <S.BalanceValue>{formatCredits(balanceCredits)}</S.BalanceValue>
                </S.BalanceRow>
              </S.TextBlock>
            </S.InfoGroup>
            <S.PriceCol>
              <S.Price>
                <CurrencyIcon />
                <span>{formatCredits(creditsLegDisplay)}</span>
              </S.Price>
            </S.PriceCol>
          </S.Content>
        </S.OptionRow>

        <S.OptionRow
          type="button"
          data-testid="pay-with-mana"
          data-selected={hasM}
          data-disabled={!manaUsable}
          disabled={busy || !manaUsable}
          aria-pressed={hasM}
          onClick={() => toggle('mana')}
        >
          <S.LeftSlot>
            <S.CheckBox data-checked={hasM}>
              <Icon name="check" className="ico" />
            </S.CheckBox>
          </S.LeftSlot>
          <S.Content>
            <S.InfoGroup>
              <S.Logo>
                <S.RailArt src={manaLogo} w={35.328} h={35.328} alt="" aria-hidden />
              </S.Logo>
              <S.TextBlock>
                <S.Label>{t('buyModal.methodMana')}</S.Label>
                <S.BalanceRow>
                  {t('buyModal.manaBalanceLabel')}
                  <S.ManaMini src={manaCoin} alt="" aria-hidden />
                  <S.BalanceValue>{formatMana(manaBalanceWei)}</S.BalanceValue>
                </S.BalanceRow>
              </S.TextBlock>
            </S.InfoGroup>
            <S.PriceCol>
              {manaUsable ? (
                <>
                  <S.Price>
                    <S.ManaPriceIco src={manaCoin} alt="" aria-hidden />
                    <span>{formatMana(manaLeg)}</span>
                  </S.Price>
                </>
              ) : (
                // Held MANA that buys nothing here. Stated as the fact it is — the balance is short —
                // and NOT as what it is worth in credits: this app does not quote a MANA/credits rate
                // anywhere, so it must not quote one here either.
                <S.Detail data-testid="mana-shortfall-note">{t('buyModal.notEnoughMana')}</S.Detail>
              )}
            </S.PriceCol>
          </S.Content>
        </S.OptionRow>
      </S.Options>

      {notice ? (
        <S.Notice data-testid="price-changed" role="status">
          {notice}
        </S.Notice>
      ) : null}

      <S.BuyBtn
        type="button"
        data-testid="confirm-payment"
        disabled={busy || method === null}
        onClick={() => method && onBuy(method)}
      >
        {t('buyModal.buy')}
      </S.BuyBtn>
    </S.Root>
  )
}

export default PaymentMethodStep
