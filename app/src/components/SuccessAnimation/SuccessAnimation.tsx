import * as S from './SuccessAnimation.styles'
import { t } from '~/intl/i18n'

// Polished success animation: a ring + checkmark that draw in, with a soft confetti burst.
// SVG/CSS (no deps). To swap for a real Lottie later: drop a JSON in src/assets and render it
// with lottie-react here — the rest of the Success page stays the same.
export function SuccessAnimation() {
  return (
    <S.Root role="img" aria-label={t('successAnimation.label')} data-testid="success-anim">
      <S.Svg viewBox="0 0 120 120">
        <S.Ring cx="60" cy="60" r="54" />
        <S.Check d="M37 61 l16 16 l30 -34" />
      </S.Svg>
      <S.Spark data-spark="1" aria-hidden>
        ✦
      </S.Spark>
      <S.Spark data-spark="2" aria-hidden>
        ✦
      </S.Spark>
      <S.Spark data-spark="3" aria-hidden>
        ◈
      </S.Spark>
      <S.Spark data-spark="4" aria-hidden>
        ✦
      </S.Spark>
    </S.Root>
  )
}
