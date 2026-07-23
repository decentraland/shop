import type { SVGProps } from 'react'

// Light arrow for the "Try in world" CTA — sits on a colored button, hence the near-white stroke.
export function ArrowRightIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden {...props}>
      <path
        d="M5 12h12M13 7l5 5-5 5"
        fill="none"
        stroke="#fcfcfc"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
