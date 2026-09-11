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
import { SaleCountdown } from '~/components/SaleCountdown'
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

/** A creator's sales, newest first, with the one action a running sale has: ending it early. */
export function CreatorSales({ sales, session }: { sales: CreatorSale[]; session: Session }) {
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
        return (
          <S.Row key={sale.id} data-status={status} data-testid="creator-sale">
            <S.Badge aria-label={t('creatorSale.offPct', { pct })}>-{pct}%</S.Badge>
            <S.Info>
              <S.Line>
                <S.Collections>{t('creatorSale.successBody', { count: sale.collections.length, pct })}</S.Collections>
                <S.Pill data-status={status}>{statusCopy(status)}</S.Pill>
              </S.Line>
              <S.Meta>
                {status === 'active' ? (
                  <>
                    {t('creatorSale.endsIn')} <SaleCountdown endsAt={sale.checks.expiration} />
                  </>
                ) : status === 'scheduled' ? (
                  t('creatorSale.startsOn', { date: formatDateTime(sale.checks.effective) })
                ) : null}
                {isSaleCapped(sale) ? (
                  <span>{t('creatorSale.used', { used: sale.state?.uses ?? 0, total: sale.checks.uses })}</span>
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
