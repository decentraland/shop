// The Figma "Insufficient Funds" glyph (mingcute:warning-line) — a circle-exclamation stroked in
// Brand/Purple (#691fa9). Shared by the PDP BuyModal and the cart CartCheckoutModal no-funds banners
// so the two icons can never drift.
export function WarningIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden className={className}>
      <circle cx="12" cy="12" r="9" fill="none" stroke="#691fa9" strokeWidth="1.8" />
      <path d="M12 7v6" stroke="#691fa9" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="16.5" r="1.1" fill="#691fa9" />
    </svg>
  )
}

export default WarningIcon
