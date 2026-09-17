import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Session } from '~/lib/auth'
import { endSale, isSaleCapped, liveSaleStatus, type CreatorSale, type CreatorSaleStatus } from '~/lib/coupons'
import { track, errorCode } from '~/lib/analytics'
import { captureError } from '~/lib/monitoring'
import { friendlyError } from '~/lib/errors'
import { formatDateTime } from '~/lib/dates'
import { toast } from '~/store/toast'
import { t } from '~/intl/i18n'
import { Button } from '~/components/Button'
import { CollectionThumb } from '~/components/CollectionThumb'
import { SaleTag } from '~/components/SaleTag'
import { SaleTimer } from '~/components/SaleTimer'
import { Tooltip } from '~/components/Tooltip'
import type { SaleLift } from '~/lib/storeMetrics'
import * as S from './CreatorSales.styles'

function statusCopy(status: CreatorSaleStatus): string {
  switch (status) {
    case 'active':
      return t('creatorSale.statusActive')
    case 'scheduled':
      return t('creatorSale.statusScheduled')
    case 'cancelled':
      return t('creatorSale.statusCancelled')
    case 'exhausted':
      return t('creatorSale.statusExhausted')
    case 'revoked':
      return t('creatorSale.statusRevoked')
    default:
      return t('creatorSale.statusEnded')
  }
}

/** Which way a discount moved the store, for the chip's colour. */
function liftDirection(lift: SaleLift): 'up' | 'down' | 'flat' {
  if (lift.liftPct === null || Math.round(lift.liftPct) === 0) return 'flat'
  return lift.liftPct > 0 ? 'up' : 'down'
}

/**
 * How the discount is doing, in words.
 *
 * Past 1000% a percentage stops being a reading and starts being a number nobody can picture, so a big
 * jump is stated as a multiple instead.
 */
function liftCopy(lift: SaleLift): string {
  if (lift.liftPct === null) return t('creatorSale.liftNoBaseline')
  const rounded = Math.round(lift.liftPct)
  if (rounded === 0) return t('creatorSale.liftFlat')
  const amount =
    rounded >= 1000
      ? `${Math.round(lift.duringPerDay / lift.beforePerDay).toLocaleString()}\u00d7`
      : `${Math.abs(rounded)}%`
  return t(rounded > 0 ? 'creatorSale.liftUp' : 'creatorSale.liftDown', { amount })
}

/** A creator's sales, newest first, with the one action a running sale has: ending it early. */
export function CreatorSales({
  sales,
  session,
  names,
  lift
}: {
  sales: CreatorSale[]
  session: Session
  /**
   * How each sale is doing against the days before it started, keyed by sale id.
   *
   * Optional, and null per sale where the answer would not be honest: the caller owns the rows the figure
   * is measured from, and only it can tell whether they reach back far enough to compare against.
   */
  lift?: Record<string, SaleLift | null>
  /** Collection names by lowercased address, so a row can say WHICH collection rather than "1 collection". */
  names?: Record<string, string>
}) {
  const queryClient = useQueryClient()
  // Which row is asking "end it now?", and which ones this session already ended (the server learns of a
  // cancellation on its next state read, so the row would otherwise keep saying "live" for up to a minute).
  const [confirming, setConfirming] = useState<string | null>(null)
  const [ending, setEnding] = useState<string | null>(null)
  const [endedHere, setEndedHere] = useState<string[]>([])

  async function end(sale: CreatorSale) {
    setEnding(sale.id)
    try {
      await endSale({ sale, signer: session.signer })
      setEndedHere(prev => [...prev, sale.id])
      setConfirming(null)
      track('Shop Ended Sale', { sale_id: sale.id, discount_pct: sale.discount / 10_000 })
      toast.success(t('creatorSale.endedToast'))
      void queryClient.invalidateQueries({ queryKey: ['creator-sales'] })
      void queryClient.invalidateQueries({ queryKey: ['shop-items'] })
      void queryClient.invalidateQueries({ queryKey: ['catalog-items'] })
    } catch (e) {
      captureError(e, { flow: 'creator_sale_end' })
      track('Shop Sale Failed', { error_code: errorCode(e), step: 'end' })
      toast.error(friendlyError(e, t('creatorSale.endError')))
    } finally {
      setEnding(null)
    }
  }

  return (
    <S.List data-testid="creator-sales">
      {sales.map(sale => {
        const status = endedHere.includes(sale.id) ? 'cancelled' : liveSaleStatus(sale)
        const running = status === 'active' || status === 'scheduled'
        const pct = sale.discount / 10_000
        // Named only when the sale covers exactly one collection — a mosaic of the first of several would
        // claim the discount belongs to it alone.
        const only = sale.collections.length === 1 ? sale.collections[0] : null
        const name = only ? names?.[only.toLowerCase()] : undefined
        return (
          <S.Row key={sale.id} data-status={status} data-testid="creator-sale">
            {/* The collection's own mosaic: a list of "1 collection at 50% off" rows cannot be told apart
                once a creator runs more than one discount, which is exactly when this panel matters. */}
            {only ? (
              <S.Thumb>
                <CollectionThumb contractAddress={only} />
              </S.Thumb>
            ) : null}
            <S.Info>
              <S.Line>
                <S.Collections>
                  {name ?? t('creatorSale.successBody', { count: sale.collections.length, pct })}
                </S.Collections>
                <S.Pill data-status={status}>{statusCopy(status)}</S.Pill>
              </S.Line>
              <S.Meta>
                {/* Beside the timer rather than in a column of its own: the two are the same kind of chip,
                    and stranded in its own cell the tag centred itself across both lines of the row while
                    the name sat on the first. */}
                <SaleTag pct={pct} />
                {status === 'active' ? (
                  // Carries its own "Ends in", so the row no longer says it twice.
                  <SaleTimer until={sale.checks.expiration} />
                ) : status === 'scheduled' ? (
                  t('creatorSale.startsOn', { date: formatDateTime(sale.checks.effective) })
                ) : null}
                {isSaleCapped(sale) ? (
                  <span>{t('creatorSale.used', { used: sale.state?.uses ?? 0, total: sale.checks.uses })}</span>
                ) : null}
                {lift?.[sale.id] ? (
                  <Tooltip content={t('creatorSale.liftHint')}>
                    <S.Lift data-dir={liftDirection(lift[sale.id] as SaleLift)} data-testid="creator-sale-lift">
                      {liftCopy(lift[sale.id] as SaleLift)}
                    </S.Lift>
                  </Tooltip>
                ) : null}
              </S.Meta>
            </S.Info>
            {running ? (
              confirming === sale.id ? (
                <S.Confirm>
                  <Button
                    variant="red"
                    size="sm"
                    disabled={ending === sale.id}
                    onClick={() => void end(sale)}
                    data-testid="creator-sale-end-confirm"
                  >
                    {ending === sale.id ? t('creatorSale.ending') : t('creatorSale.confirmEnd')}
                  </Button>
                  <Button variant="ghost" size="sm" disabled={ending === sale.id} onClick={() => setConfirming(null)}>
                    {t('creatorSale.keepSale')}
                  </Button>
                </S.Confirm>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirming(sale.id)}
                  data-testid="creator-sale-end"
                >
                  {t('creatorSale.endSale')}
                </Button>
              )
            ) : null}
          </S.Row>
        )
      })}
    </S.List>
  )
}

export default CreatorSales
