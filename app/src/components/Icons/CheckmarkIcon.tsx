import type { SVGProps } from 'react'

// Bare white checkmark for the "in cart" / "purchased" thumbnail badges — colored surface comes from the parent.
export function CheckmarkIcon({ size = 12, ...props }: { size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" width={size} height={size} fill="none" aria-hidden focusable="false" {...props}>
      <path d="M5 10.5l3 3 7-7.5" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
