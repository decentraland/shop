import { lazy, Suspense } from 'react'
import { config } from '~/config'
import { useAfterLoadIdle } from '~/hooks/useAfterLoadIdle'

const IntercomLauncher = lazy(() => import('./IntercomLauncher'))

// Same check the dapps widget uses to stay silent on mobile. It still injects Intercom's script there,
// so the launcher is never mounted at all.
function isMobile(): boolean {
  return /Mobi|Android/i.test(navigator.userAgent)
}

/** The Intercom support launcher. Renders nothing on mobile, without an app id, or before the page has gone idle. */
export function Intercom() {
  const appId = config.intercomAppId
  // Holding the mount keeps the widget's chunk and ~300KB of third-party script out of the first paint.
  const idle = useAfterLoadIdle()

  if (!appId || !idle || isMobile()) return null
  return (
    <Suspense fallback={null}>
      <IntercomLauncher appId={appId} />
    </Suspense>
  )
}
