import * as S from './SkeletonCards.styles'

// Placeholder cards shown while a grid or rail loads — on first load and while fetching the next page.
// Purely decorative → aria-hidden, but testid'd: "is the loading state showing" is exactly what a spec
// needs to assert, and counting anonymous aria-hidden divs breaks as soon as anything else is hidden.
export function SkeletonCards({ count = 12 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <S.SkeletonCard key={i} aria-hidden data-testid="skeleton-card" />
      ))}
    </>
  )
}

export default SkeletonCards
