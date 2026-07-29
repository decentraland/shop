import type { SVGProps } from 'react'

export function CloseIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden {...props}>
      <path d="M4 4l10 10M14 4L4 14" stroke="#161518" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}
