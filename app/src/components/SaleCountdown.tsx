import { useEffect, useState } from 'react'
import { saleTimeLeft, formatCountdown, countdownTickMs } from '~/lib/sale'
import { Icon } from '~/components/Icon'

// Live "ends in 2d 4h" label for a flash sale. Repaints on a self-adjusting timer — once a minute
// while the end is far off, once a second in the final hour (see countdownTickMs) — so a whole grid
// of these doesn't re-render every second. Renders nothing for an open-ended or already-finished sale.
export function SaleCountdown({
  endsAt,
  className,
  testId,
  iconSize = 13
}: {
  endsAt?: number
  className?: string
  testId?: string
  iconSize?: number
}) {
  const [left, setLeft] = useState(() => saleTimeLeft(endsAt))

  useEffect(() => {
    setLeft(saleTimeLeft(endsAt))
    if (endsAt == null) return
    let timer: ReturnType<typeof setTimeout>
    const tick = () => {
      const remaining = saleTimeLeft(endsAt)
      setLeft(remaining)
      const next = countdownTickMs(remaining)
      if (next > 0) timer = setTimeout(tick, next)
    }
    const first = countdownTickMs(saleTimeLeft(endsAt))
    if (first > 0) timer = setTimeout(tick, first)
    return () => clearTimeout(timer)
  }, [endsAt])

  const label = formatCountdown(left)
  if (!label) return null
  return (
    <span className={className ?? 'sale-countdown'} data-testid={testId}>
      <Icon name="clock" size={iconSize} />
      {label}
    </span>
  )
}
