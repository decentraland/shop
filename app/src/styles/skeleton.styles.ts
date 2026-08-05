import styled from '@emotion/styled'

/**
 * A placeholder for text that has not arrived yet — the shared `.skeleton` shimmer, sized to the string it
 * stands in for. Pair it with `className="skeleton"` and `aria-hidden`.
 *
 * `height: 1em` and inline-block on purpose: the line box stays driven by the parent's own line-height, so
 * the row keeps the exact height it has with the text in it and nothing below can shift when it lands.
 */
export const TextSkeleton = styled.span<{ width: number }>`
  display: inline-block;
  width: ${p => p.width}px;
  height: 1em;
  vertical-align: -0.1em;
  border-radius: 4px;
`
