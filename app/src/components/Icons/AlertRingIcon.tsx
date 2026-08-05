import type { SVGProps } from 'react'
import { theme } from '~/styles/theme'

/**
 * The failure counterpart to the `done-ring` asset: the same 84.837 ring at the same 6.087 round-capped
 * stroke, so the two outcomes of a migration are the same shape and differ only in what they hold — a
 * check in the flare gradient, or this exclamation in the error red.
 */
export function AlertRingIcon({ size = 84.837, ...props }: { size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 84.837 84.837" width={size} height={size} fill="none" aria-hidden focusable="false" {...props}>
      <g stroke={theme.colors.errStrong} strokeWidth="6.08696" strokeLinecap="round">
        <circle cx="42.4185" cy="42.4185" r="39.375" />
        <path d="M42.4185 22.5V47.5" />
      </g>
      <circle cx="42.4185" cy="60.75" r="3.8" fill={theme.colors.errStrong} />
    </svg>
  )
}
