// Placeholder cards shown while a grid loads — on first load and while fetching the next page.
// Uses the shared `.card--skeleton` shimmer (see index.css). Purely decorative → aria-hidden.
export function SkeletonCards({ count = 12 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div className="card card--skeleton" key={i} aria-hidden />
      ))}
    </>
  )
}

export default SkeletonCards
