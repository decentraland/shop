import type { SVGProps } from 'react'

// Figma "mingcute:warning-line" (1178:172204): a filled circle-exclamation in DCL's warning orange.
// Kept under the old name so both buy modals and their specs keep importing one glyph.
export function WarningTriangleIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" width="24" height="24" aria-hidden {...props}>
      <path
        fill="#f48221"
        d="M10 0a10 10 0 1 1 0 20 10 10 0 0 1 0-20Zm0 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm0 11a1 1 0 1 1 0 2 1 1 0 0 1 0-2Zm0-8a1 1 0 0 1 1 1v5a1 1 0 1 1-2 0V6a1 1 0 0 1 1-1Z"
      />
    </svg>
  )
}
