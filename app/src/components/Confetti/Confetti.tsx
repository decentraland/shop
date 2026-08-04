import { Suspense, lazy, useState } from 'react'
import * as S from './Confetti.styles'

/**
 * The purchase-completed confetti burst.
 *
 * The animation is the marketplace's — lifted verbatim from its success page
 * (webapp/src/components/SuccessPage/successAnimation.json, played there with lottie-react) so the two
 * storefronts celebrate a purchase with the SAME cannon rather than two lookalikes that drift apart.
 *
 * lottie-web is ~250KB of runtime and the animation another ~65KB of JSON, and both matter on exactly one
 * screen — so they load on demand (the pattern LazyWearablePreview and AnimatedBackground use) and never
 * reach the entry chunk.
 */
const LottieBurst = lazy(async () => {
  const [{ default: Lottie }, { default: animationData }] = await Promise.all([
    import('lottie-react'),
    import('./confettiAnimation.json')
  ])
  // loop={1} is one repeat, i.e. the marketplace's double burst — then it stops. Never an endless loop:
  // this sits behind a receipt the buyer may want to read.
  return { default: () => <Lottie animationData={animationData} loop={1} /> }
})

export function Confetti() {
  // A burst of motion over a payment confirmation is precisely the case prefers-reduced-motion exists for,
  // and CSS can't stop a JS-driven Lottie — so the decision is made here, before anything is fetched.
  // Read once at mount (a lazy initial state, no effect): the animation is a one-shot, so re-evaluating it
  // on a mid-play settings change would only ever cut it off half-way. An absent matchMedia plays, matching
  // AnimatedBackground's fail-open.
  const [play] = useState(() => !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
  if (!play) return null

  return (
    <S.Layer aria-hidden data-testid="confetti">
      <Suspense fallback={null}>
        <LottieBurst />
      </Suspense>
    </S.Layer>
  )
}

export default Confetti
