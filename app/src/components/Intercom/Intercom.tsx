import { useEffect, useMemo, useState } from 'react'
import IntercomWidget from 'decentraland-dapps/dist/components/Intercom'
import { config } from '~/config'
import { useWallet } from '~/store/wallet'
import { anonymousId, onAnalyticsReady } from '~/lib/analytics'

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

/**
 * The Intercom support launcher. Renders nothing without an app id, and the underlying dapps widget
 * hides itself on mobile.
 */
export function Intercom() {
  const appId = config.intercomAppId
  const session = useWallet(s => s.session)
  // The id is kept as a string, not an object: the widget re-renders on every prop change, and feeding it
  // a fresh object each time turns ready() -> setState into an endless loop.
  const [anonId, setAnonId] = useState<string>()

  useEffect(() => {
    if (!appId) return
    onAnalyticsReady(() => {
      const id = anonymousId()
      if (id) setAnonId(id)
    })
  }, [appId])

  const address = session?.address
  const providerType = session?.providerType
  const data = useMemo(() => intercomData({ address, providerType, anonId }), [address, providerType, anonId])

  if (!appId) return null
  return <IntercomWidget appId={appId} data={data} settings={{ alignment: 'right' }} />
}
