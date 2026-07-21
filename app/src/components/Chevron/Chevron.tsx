import type { ComponentPropsWithoutRef } from 'react'
import * as S from './Chevron.styles'

type ChevronProps = {
  /** Point up (rotated 180°) when open, animating between the two. */
  up?: boolean
  size?: number
  color?: string
} & Omit<ComponentPropsWithoutRef<'span'>, 'color'>

export function Chevron({ up = false, ...rest }: ChevronProps) {
  return <S.Root name="chevron-down" data-up={up || undefined} {...rest} />
}
