import { CurrencyIcon } from '~/components/CurrencyIcon'
import { CURRENCY, formatCredits } from '~/lib/currency'
import { formatMana } from '~/lib/mana-format'
import { creditsFromCents, type ManaShortfall, type PaymentMethod, type PaymentOption } from '~/lib/payment-options'
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
 * There are never three enabled at once: `combined` only exists when the credits alone fall short, which
 * is exactly when the credits-only rail is unavailable — so at most two payable buttons ever render.
 *
 * A buyer holding MANA that can't cover the purchase gets the MANA button anyway, DISABLED, captioned
 * with what their balance is worth (`shortfall`). Hiding it instead reads as a bug — the navbar shows a
 * MANA balance, so its absence here needs a reason on screen, not silence.
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
  creditsLabel,
  shortfall,
  showCreditsAmount = true
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
  /** Held MANA that can't pay for this purchase — renders the disabled MANA button. */
  shortfall?: ManaShortfall | null
  /**
   * Whether the credits button states its amount. On by default, and the item flow needs it: that button is
   * the only place the price appears. The cart turns it OFF because its purchase summary states the total on
   * the line directly above, so the button repeated it a centimetre away.
   *
   * Only the CREDITS leg is affected. The MANA and combined buttons name a different figure than the total —
   * a MANA amount, or how the charge splits — so theirs is information the summary does not carry.
   */
  showCreditsAmount?: boolean
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
              {showCreditsAmount ? (
                <S.Amount>
                  <CurrencyIcon />
                  <span>{formatCredits(creditsFromCents(option.creditsCents))}</span>
                </S.Amount>
              ) : null}
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
                <S.ManaMark>
                  <img src={manaLight} alt="" aria-hidden />
                </S.ManaMark>
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
              <S.ManaMark>
                <img src={manaLight} alt="" aria-hidden />
              </S.ManaMark>
              <span>{formatMana(option.manaWei)}</span>
              {/* The unit is spelled out on the mixed CTA: unlike the MANA-only button (whose label
                  already says "Buy with MANA"), here two marks sit side by side and the icons alone
                  would leave which number is which to recognition. */}
              <S.Unit>MANA</S.Unit>
            </S.Amount>
          </S.ManaBtn>
        )
      })}
      {/* MANA the buyer holds that still can't pay for this. Shown, not hidden: the balance is visible in
          the navbar, so the button's absence needs a stated reason. The caption converts the balance into
          credits at this purchase's own rate, which IS the explanation — MANA is oracle-priced, so a
          balance that looks large next to a credits price can be worth a fraction of it. */}
      {shortfall ? (
        <>
          <S.ManaBtn key="mana-short" type="button" data-testid="pay-with-mana-disabled" disabled>
            <span>{t('buyModal.buyWithMana')}</span>
            <S.Amount>
              <S.ManaMark>
                <img src={manaLight} alt="" aria-hidden />
              </S.ManaMark>
              <span>{formatMana(shortfall.manaWei)}</span>
            </S.Amount>
          </S.ManaBtn>
          <S.ShortfallNote data-testid="mana-shortfall-note">
            {t('buyModal.manaWorth', {
              mana: formatMana(shortfall.manaWei),
              credits: formatCredits(creditsFromCents(shortfall.manaCents)),
              price: formatCredits(creditsFromCents(shortfall.priceCents)),
              currency: CURRENCY.name
            })}
          </S.ShortfallNote>
        </>
      ) : null}
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
