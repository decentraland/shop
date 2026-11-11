import { lazy, Suspense } from 'react'
import { config } from '~/config'
import { useAfterLoadIdle } from '~/hooks/useAfterLoadIdle'

const IntercomLauncher = lazy(() => import('./IntercomLauncher'))

/**
 * The Intercom support launcher. Renders nothing without an app id or before the page has gone idle,
 * and the underlying dapps widget hides itself on mobile.
 */
export function Intercom() {
  const appId = config.intercomAppId
  // Holding the mount keeps the widget's chunk and ~300KB of third-party script out of the first paint.
  const idle = useAfterLoadIdle()

  if (!appId || !idle) return null
  return (
    <Suspense fallback={null}>
      <IntercomLauncher appId={appId} />
    </Suspense>
  )
}
