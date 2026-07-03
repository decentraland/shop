// Polished success animation: a ring + checkmark that draw in, with a soft confetti burst.
// SVG/CSS (no deps). To swap for a real Lottie later: drop a JSON in src/assets and render it
// with lottie-react here — the rest of the Success page stays the same.
export function SuccessAnimation() {
  return (
    <div className="success-anim" role="img" aria-label="Purchase successful">
      <svg className="success-anim__svg" viewBox="0 0 120 120">
        <circle className="success-anim__ring" cx="60" cy="60" r="54" />
        <path className="success-anim__check" d="M37 61 l16 16 l30 -34" />
      </svg>
      <span className="success-anim__spark success-anim__spark--1" aria-hidden>✦</span>
      <span className="success-anim__spark success-anim__spark--2" aria-hidden>✦</span>
      <span className="success-anim__spark success-anim__spark--3" aria-hidden>◈</span>
      <span className="success-anim__spark success-anim__spark--4" aria-hidden>✦</span>
    </div>
  )
}
