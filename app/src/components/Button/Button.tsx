import { forwardRef } from 'react'
import type { ComponentPropsWithoutRef, ElementType, ForwardedRef, ReactElement } from 'react'
import * as S from './Button.styles'

export type ButtonVariant = 'default' | 'purple' | 'outline' | 'ghost'
export type ButtonSize = 'md' | 'sm'

type ButtonOwnProps = {
  /** Colour treatment. `default` is the solid dark CTA. */
  variant?: ButtonVariant
  /** `sm` is the compact padding/label. */
  size?: ButtonSize
}

// Polymorphic: renders a <button> by default, but `as` lets call sites render a router <Link> or <a>
// while keeping the button styling (7 links + 1 anchor use `.btn` today). The `as` target's own props
// (e.g. `to`, `href`) come through unchanged.
type ButtonProps<C extends ElementType> = ButtonOwnProps & { as?: C } & Omit<
    ComponentPropsWithoutRef<C>,
    keyof ButtonOwnProps | 'as'
  >

function ButtonInner<C extends ElementType = 'button'>(
  { as, variant = 'default', size = 'md', ...rest }: ButtonProps<C>,
  ref: ForwardedRef<Element>
) {
  // Rendered through a loosely-typed alias: the styled tag is `button`, but polymorphic `as` + ref
  // can't be statically reconciled with it. The strict, useful typing lives on the exported signature
  // below; here we just forward. variant/size are surfaced as data-* — never leaked as DOM props.
  const Root = S.Root as ElementType
  return <Root as={as} ref={ref} data-variant={variant} data-size={size} {...rest} />
}

// forwardRef erases the generic, so re-assert the polymorphic call signature.
export const Button = forwardRef(ButtonInner) as <C extends ElementType = 'button'>(
  props: ButtonProps<C> & { ref?: ForwardedRef<Element> }
) => ReactElement
