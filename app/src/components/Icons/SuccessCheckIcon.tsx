import type { SVGProps } from 'react'

// Large filled success check on the purchase-complete screens.
export function SuccessCheckIcon({ size = 64, ...props }: { size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden {...props}>
      <circle cx="32" cy="32" r="32" fill="#34ce74" />
      <path
        d="M20 33l8 8 16-18"
        fill="none"
        stroke="#fff"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
