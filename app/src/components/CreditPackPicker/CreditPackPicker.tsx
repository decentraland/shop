import { Icon } from '~/components/Icon'
import { formatCredits } from '~/lib/currency'
import type { CreditPack } from '~/lib/payments'
import { t } from '~/intl/i18n'
import packCoin from '~/assets/credits/pack-coin.webp'
import * as M from '~/components/BuyModal/modal.styles'
import * as S from './CreditPackPicker.styles'

/**
 * The no-funds credit-pack picker: the tiles and the running total, shared by the three screens that sell
 * a top-up mid-purchase (the item modal, the cart and the NAME modal).
 *
 * It was written four times over and had already drifted — only one of them offered a recommendation, and
 * only two carried the `data-testid` the suites select on. The pack MATHS lives in `offerablePacks`
 * (lib/payments) for the same reason; this is only how it is drawn.
 *
 * `recommendedId` is opt-in, and it is a PROMISE that the pack finishes the purchase: pass it only when
 * `offerablePacks` reports `closesGap`, or the badge claims exactly what the covering filter exists to
 * prevent.
 */
export function CreditPackPicker({
  packs,
  selectedId,
  onSelect,
  recommendedId
}: {
  packs: CreditPack[]
  /** The pack the total reflects. Undefined until the buyer picks one, where the screen requires a pick. */
  selectedId?: string
  onSelect: (id: string) => void
  recommendedId?: string
}) {
  const selected = packs.find(p => p.id === selectedId)
  // The badge hangs above its tile, which only the two-column grid leaves room for.
  const Packs = recommendedId ? S.GridPacks : M.Packs

  return (
    <>
      <Packs data-testid="credit-packs">
        {packs.map(p => (
          <S.PackTile
            key={p.id}
            type="button"
            data-testid="credit-pack"
            data-on={p.id === selectedId || undefined}
            aria-pressed={p.id === selectedId}
            aria-label={t('getCredits.packAria', { amount: formatCredits(p.credits), usd: p.usd })}
            onClick={() => onSelect(p.id)}
          >
            {p.id === recommendedId ? (
              <S.PackBadge data-testid="pack-recommended" aria-hidden>
                <Icon name="star-rounded" />
                {t('getCredits.packBadge')}
              </S.PackBadge>
            ) : null}
            <M.PackIco src={packCoin} alt="" />
            <M.PackAmount>{formatCredits(p.credits)}</M.PackAmount>
            <M.PackUsd>(${p.usd.toFixed(2)})</M.PackUsd>
          </S.PackTile>
        ))}
      </Packs>
      <M.Total>
        <M.TotalCredits>
          <M.TotalIco />
          <span data-testid="topup-total-credits">{formatCredits(selected?.credits ?? 0)}</span>
        </M.TotalCredits>
        <M.TotalUsd>${(selected?.usd ?? 0).toFixed(2)}</M.TotalUsd>
      </M.Total>
    </>
  )
}
