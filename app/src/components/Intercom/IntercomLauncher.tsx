import { useEffect, useMemo, useRef, useState } from 'react'
import IntercomWidget from 'decentraland-dapps/dist/components/Intercom'
import { isMobile } from 'decentraland-dapps/dist/lib/utils'
import { useWallet } from '~/store/wallet'
import { anonymousId, onAnalyticsReady } from '~/lib/analytics'

// Hoisted: the dapps widget is a PureComponent, so a fresh literal per render would defeat its shallow
// prop check and re-render the launcher for nothing.
const INTERCOM_SETTINGS = { alignment: 'right' } as const

type IntercomFn = (command: string, payload?: Record<string, unknown>) => void

type IntercomIdentity = {
  address?: string | null
  providerType?: string | null
  anonId?: string
}

/**
 * The attributes Intercom shows next to a conversation. Keys match what every other Decentraland dapp
 * sends (decentraland-dapps' EnhancedIntercom), so one support inbox reads the same across apps; a
 * missing value is omitted rather than sent as null, which would overwrite a previously known one.
 */
export function intercomData({ address, providerType, anonId }: IntercomIdentity): Record<string, string> {
  const data: Record<string, string> = {}
  if (address) data['Wallet'] = address.toLowerCase()
  if (providerType) data['Wallet type'] = providerType
  // Stitches the conversation to the visitor's analytics identity, so a support thread can be traced
  // back to the funnel events of the same (anonymous) session.
  if (anonId) data.anon_id = anonId
  return data
}

/** The dapps Intercom widget, kept in sync with who is signed in. */
export default function IntercomLauncher({ appId }: { appId: string }) {
  const session = useWallet(s => s.session)
  const address = session?.address
  const providerType = session?.providerType
  // The id is kept as a string, not an object: the widget re-renders on every prop change, and feeding it
  // a fresh object each time turns ready() -> setState into an endless loop.
  const [anonId, setAnonId] = useState<string>()
  const previousAddress = useRef(address)

  useEffect(() => {
    // Re-read on every session change: signing out resets analytics, which issues a new anonymous id.
    onAnalyticsReady(() => setAnonId(anonymousId()))
  }, [address])

  useEffect(() => {
    const previous = previousAddress.current
    previousAddress.current = address
    if (!previous || previous === address) return
    const intercom = (window as unknown as { Intercom?: IntercomFn }).Intercom
    // The dapps widget never boots on mobile, so there is no session to end there.
    if (typeof intercom !== 'function' || isMobile()) return
    // The widget only ever sends `update`, which merges: without a fresh session the previous account's
    // attributes and conversation history would carry over to whoever uses this device next.
    intercom('shutdown')
    intercom('boot', {
      app_id: appId,
      ...INTERCOM_SETTINGS,
      ...intercomData({ address, providerType, anonId: anonymousId() })
    })
  }, [address, providerType, appId])

  const data = useMemo(() => intercomData({ address, providerType, anonId }), [address, providerType, anonId])

  return <IntercomWidget appId={appId} data={data} settings={INTERCOM_SETTINGS} />
}
