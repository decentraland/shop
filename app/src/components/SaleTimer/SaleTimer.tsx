import { useEffect, useState } from 'react'
import { countdownParts, saleTimeLeft } from '~/lib/sale'
import { t } from '~/intl/i18n'
import * as S from './SaleTimer.styles'

/**
 * The item page's countdown to the end of a sale: "2d 20h 37m".
 *
 * Up to three units, largest first, dropping the ones that would read as zero at the front — a sale with
 * four days left does not need its seconds, and one with four minutes left should not be rounded to "0h".
 *
 * Ticks every second so the last minute actually moves; the compact `SaleCountdown` repaints once a minute
 * until the final hour, which is the right cadence for a grid of cards and the wrong one here.
 *
 * Renders nothing once the moment has passed, so a closed window removes the chip rather than parking it
 * at zero.
 */
export function SaleTimer({ until, className, testId }: { until?: number; className?: string; testId?: string }) {
  const [left, setLeft] = useState(() => saleTimeLeft(until))

  useEffect(() => {
    setLeft(saleTimeLeft(until))
    if (until == null) return
    const timer = setInterval(() => setLeft(saleTimeLeft(until)), 1000)
    return () => clearInterval(timer)
  }, [until])

  const parts = countdownParts(left)
  if (!parts) return null

  const units: string[] = []
  if (parts.days > 0) units.push(t('saleTimer.days', { n: parts.days }))
  if (parts.days > 0 || parts.hours > 0) units.push(t('saleTimer.hours', { n: parts.hours }))
  units.push(
    parts.days > 0 ? t('saleTimer.minutes', { n: parts.minutes }) : t('saleTimer.minutes', { n: parts.minutes })
  )
  if (parts.days === 0 && parts.hours === 0) units.push(t('saleTimer.seconds', { n: parts.seconds }))

  return (
    <S.Root className={className} data-testid={testId}>
      <S.Clock name="clock-filled" aria-hidden />
      <S.Lead>{t('saleTimer.lead')}</S.Lead>
      <S.Left>{units.join(' ')}</S.Left>
    </S.Root>
  )
}

export default SaleTimer
