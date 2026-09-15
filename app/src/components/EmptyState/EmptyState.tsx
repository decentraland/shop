import type { ReactNode } from 'react'
import * as S from './EmptyState.styles'

type Props = {
  /** Illustration URL — one of the SVGs in `~/assets/empty`. */
  icon: string
  title: ReactNode
  body?: ReactNode
  /** A `to` renders a link, otherwise a button; a link may also carry an `onClick`. */
  cta?: { label: ReactNode; to: string; onClick?: () => void } | { label: ReactNode; onClick: () => void }
  /** `light` is the white-card treatment used inside light panels (the cart). */
  variant?: 'dark' | 'light'
  /** `solid` gives the CTA the filled treatment, for a screen whose whole point is that action. */
  ctaVariant?: 'default' | 'solid'
  /** Spans the column it is given and centres itself in it, for a whole-screen state. */
  fill?: boolean
  testId?: string
}

/** The shared empty-state panel: illustration, title, body and an optional CTA. */
export function EmptyState({ icon, title, body, cta, variant = 'dark', ctaVariant = 'default', fill, testId }: Props) {
  return (
    <S.Root data-variant={variant} data-fill={fill ? 'true' : undefined} data-testid={testId}>
      <S.Illustration src={icon} alt="" aria-hidden />
      <S.Text>
        <S.Title>{title}</S.Title>
        {body ? <S.Body>{body}</S.Body> : null}
      </S.Text>
      {cta ? (
        'to' in cta ? (
          <S.CtaLink to={cta.to} onClick={cta.onClick} data-variant={variant} data-cta={ctaVariant}>
            {cta.label}
          </S.CtaLink>
        ) : (
          <S.CtaButton type="button" onClick={cta.onClick} data-variant={variant} data-cta={ctaVariant}>
            {cta.label}
          </S.CtaButton>
        )
      ) : null}
    </S.Root>
  )
}
