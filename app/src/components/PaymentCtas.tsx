import { CurrencyIcon } from '~/components/CurrencyIcon'
import { formatCredits } from '~/lib/currency'
import { formatMana } from '~/lib/mana-format'
import { creditsFromCents, type PaymentMethod, type PaymentOption } from '~/lib/payment-options'
import { t } from '~/intl/i18n'
import manaLight from '~/assets/mana-matic-light.svg'
import * as S from './PaymentCtas.styles'

/**
 * The purchase CTAs, one per payment rail the buyer's balances actually support (Figma 1558-320257 /
 * 1558-320267). Shared by the item Buy Now flow and the cart checkout so both read identically.
 *
 * Each button IS the payment — it states exactly what it charges and buys in one click, instead of the
 * older select-then-confirm step:
 *   • credits   — "BUY ASSET ◈135"           (the default rail, amethyst)
 *   • mana      — "BUY WITH MANA ◈50.07"     (dark, per the Figma)
 *   • combined  — "BUY WITH ◈40 + 35.2 MANA" (dark; credits first, MANA covers the remainder)
 *
 * There are never three at once: `combined` only exists when the credits alone fall short, which is
 * exactly when the credits-only rail is unavailable — so at most two buttons ever render.
 *
 * `rateNote` (Figma 1653-368866) spells out the exchange rate underneath, so the MANA amounts above are
 * never a mystery number.
 */
export function PaymentCtas({
  options,
  totalCents,
  onPay,
  busy = false,
  rateNote,
  creditsLabel
}: {
  /** The offerable options, already filtered + ordered by lib/payment-options. */
  options: PaymentOption[]
  /** What the purchase costs in cents — the credits leg's amount comes from the option itself. */
  totalCents: number
  onPay: (method: PaymentMethod) => void
  busy?: boolean
  /** "1 credit = X MANA" at the live rate; omitted when the rate is unknown. */
  rateNote?: string | null
  /** Label for the credits button (the item flow says "Buy asset", the cart says "Buy"). */
  creditsLabel?: string
}) {
  return (
    <S.Root>
      {options.map(option => {
        if (option.method === 'credits') {
          return (
            <S.CreditsBtn
              key="credits"
              type="button"
              data-testid="pay-with-credits"
              onClick={() => onPay('credits')}
              disabled={busy}
            >
              <span>{creditsLabel ?? t('buyModal.buy')}</span>
              <S.Amount>
                <CurrencyIcon />
                <span>{formatCredits(creditsFromCents(option.creditsCents))}</span>
              </S.Amount>
            </S.CreditsBtn>
          )
        }
        if (option.method === 'mana') {
          return (
            <S.ManaBtn
              key="mana"
              type="button"
              data-testid="pay-with-mana"
              onClick={() => onPay('mana')}
              disabled={busy}
            >
              <span>{t('buyModal.buyWithMana')}</span>
              <S.Amount>
                <S.ManaMark src={manaLight} alt="" aria-hidden />
                <span>{formatMana(option.manaWei)}</span>
              </S.Amount>
            </S.ManaBtn>
          )
        }
        // Combined — the whole credit balance first, MANA for the remainder. Both legs are spelled out
        // in the label so the buyer sees each side before committing.
        return (
          <S.ManaBtn
            key="combined"
            type="button"
            data-testid="pay-with-combined"
            onClick={() => onPay('combined')}
            disabled={busy}
          >
            <span>{t('buyModal.buyWith')}</span>
            <S.Amount>
              <CurrencyIcon />
              <span>{formatCredits(creditsFromCents(option.creditsCents))}</span>
              <S.Plus>+</S.Plus>
              <S.ManaMark src={manaLight} alt="" aria-hidden />
              <span>{formatMana(option.manaWei)}</span>
              {/* The unit is spelled out on the mixed CTA: unlike the MANA-only button (whose label
                  already says "Buy with MANA"), here two marks sit side by side and the icons alone
                  would leave which number is which to recognition. */}
              <S.Unit>MANA</S.Unit>
            </S.Amount>
          </S.ManaBtn>
        )
      })}
      {rateNote ? <S.RateNote data-testid="mana-rate-note">{rateNote}</S.RateNote> : null}
      {/* The cents total is what the legs are derived from; kept out of the DOM text so the buttons stay
          the single source of truth for what gets charged. */}
      <span hidden data-testid="pay-total-cents">
        {totalCents}
      </span>
    </S.Root>
  )
}

export default PaymentCtas
