import { useEffect, useState, type ComponentPropsWithoutRef } from 'react'
import { saleTimeLeft, formatCountdown, countdownTickMs } from '~/lib/sale'
import { Icon } from '~/components/Icon'
import * as S from './SaleCountdown.styles'

// Live "2d 4h" label counting down to a moment — a sale's end, or its start. Repaints on a self-adjusting
// timer — once a minute while that moment is far off, once a second in the final hour (see countdownTickMs)
// — so a whole grid of these doesn't re-render every second. Renders nothing once the moment has passed, or
// when there is no moment to count to.
export function SaleCountdown({
  until,
  className,
  testId,
  iconSize = 13,
  ...rest
}: {
  until?: number
  className?: string
  testId?: string
  iconSize?: number
  // Forwarded so a wrapper can describe it — a Tooltip hands its trigger `aria-describedby`, and a
  // component that swallows unknown props silently breaks that link.
} & ComponentPropsWithoutRef<'span'>) {
  const [left, setLeft] = useState(() => saleTimeLeft(until))

  useEffect(() => {
    setLeft(saleTimeLeft(until))
    if (until == null) return
    let timer: ReturnType<typeof setTimeout>
    const tick = () => {
      const remaining = saleTimeLeft(until)
      setLeft(remaining)
      const next = countdownTickMs(remaining)
      if (next > 0) timer = setTimeout(tick, next)
    }
    const first = countdownTickMs(saleTimeLeft(until))
    if (first > 0) timer = setTimeout(tick, first)
    return () => clearTimeout(timer)
  }, [until])

  const label = formatCountdown(left)
  if (!label) return null
  return (
    <S.Root className={className} data-testid={testId} {...rest}>
      <Icon name="clock" size={iconSize} />
      {label}
    </S.Root>
  )
}

export default SaleCountdown
