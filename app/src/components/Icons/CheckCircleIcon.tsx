import type { SVGProps } from 'react'

// Green check-in-circle for the cart drawer's success banner and line thumbnails. Fills its parent box.
export function CheckCircleIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden focusable="false" {...props}>
      <circle cx="10" cy="10" r="10" fill="#1ea672" />
      <path d="M5.8 10.3l2.7 2.7 5.7-6" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
