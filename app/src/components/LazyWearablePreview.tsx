import { lazy, Suspense, type ComponentProps } from 'react'
import type { WearablePreview as WearablePreviewComponent } from 'decentraland-ui2/dist/components/WearablePreview'

// The 3D preview iframe + its controller/schema deps only matter on hover (cards) and the detail
// page, so load them on demand instead of in the initial bundle. The type import is erased at build
// time, so this module doesn't pull decentraland-ui2 into the entry chunk.
const WearablePreviewLazy = lazy(() =>
  import('decentraland-ui2/dist/components/WearablePreview').then(m => ({
    default: m.WearablePreview,
  })),
)

export function WearablePreview(props: ComponentProps<typeof WearablePreviewComponent>) {
  return (
    <Suspense fallback={null}>
      <WearablePreviewLazy {...props} />
    </Suspense>
  )
}
