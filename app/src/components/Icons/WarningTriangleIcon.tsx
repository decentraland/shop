import type { SVGProps } from 'react'

export function WarningTriangleIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden {...props}>
      <path d="M12 3L2 20h20L12 3z" fill="none" stroke="#691fa9" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M12 9v5" stroke="#691fa9" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="17" r="1.1" fill="#691fa9" />
    </svg>
  )
}
