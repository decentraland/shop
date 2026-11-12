import { useEffect, useMemo, useState } from 'react'
import IntercomWidget from 'decentraland-dapps/dist/components/Intercom'
import { IntercomWidget as IntercomClient } from 'decentraland-dapps/dist/components/Intercom/IntercomWidget'
import { useWallet } from '~/store/wallet'
import { anonymousId, onAnalyticsReady } from '~/lib/analytics'

// Hoisted: the dapps widget is a PureComponent, so a fresh literal per render would defeat its shallow
// prop check and re-render the launcher for nothing.
const INTERCOM_SETTINGS = { alignment: 'right' } as const

const OWNER_KEY = 'shop:intercom_wallet'

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

// Persisted, not kept in memory: an account switch in the wallet reloads the page, so the account a
// support session belongs to has to outlive the page load to be compared against the next one.
function readOwner(): string | null {
  try {
    return localStorage.getItem(OWNER_KEY)
  } catch {
    return null
  }
}

function writeOwner(wallet: string | null): void {
  try {
    if (wallet) localStorage.setItem(OWNER_KEY, wallet)
    else localStorage.removeItem(OWNER_KEY)
  } catch {
    // Without storage the reset only covers changes inside one page load.
  }
}

/** Ends the current Intercom session and starts an empty one carrying `data`. */
async function restartSession(appId: string, data: Record<string, string>): Promise<void> {
  const client = IntercomClient.getInstance()
  if (!client.appId) client.init(appId, INTERCOM_SETTINGS)
  await client.inject()
  const intercom = (window as unknown as { Intercom?: IntercomFn }).Intercom
  intercom?.('shutdown')
  intercom?.('boot', { app_id: appId, ...INTERCOM_SETTINGS, ...data })
}

/** The dapps Intercom widget, kept in sync with who is signed in. */
export default function IntercomLauncher({ appId }: { appId: string }) {
  const session = useWallet(s => s.session)
  const restored = useWallet(s => s.restored)
  const wallet = session?.address.toLowerCase() ?? null
  const providerType = session?.providerType
  // The id is kept as a string, not an object: the widget re-renders on every prop change, and feeding it
  // a fresh object each time turns ready() -> setState into an endless loop.
  const [anonId, setAnonId] = useState<string>()
  // The account Intercom's session belongs to. Attaching an account to an anonymous session is a plain
  // sign-in; any other change means the session has to end, or the widget's `update`, which merges,
  // would hand the previous account's attributes and conversations to whoever comes next.
  const [owner, setOwner] = useState(readOwner)
  const stale = owner !== null && owner !== wallet

  useEffect(() => {
    // Re-read on every session change: signing out resets analytics, which issues a new anonymous id.
    onAnalyticsReady(() => setAnonId(anonymousId()))
  }, [wallet])

  useEffect(() => {
    // Before the restore settles a null session only means "not looked yet".
    if (!restored || owner === wallet) return
    const adopt = () => {
      writeOwner(wallet)
      setOwner(wallet)
    }
    if (!stale) {
      adopt()
      return
    }
    let cancelled = false
    const freshAnonId = anonymousId()
    void restartSession(appId, intercomData({ address: wallet, providerType, anonId: freshAnonId })).then(() => {
      if (cancelled) return
      // Segment may have become ready, and set the id, while the restart waited on Intercom's script.
      setAnonId(current => freshAnonId ?? current)
      adopt()
    })
    return () => {
      cancelled = true
    }
  }, [restored, owner, wallet, stale, providerType, appId])

  const data = useMemo(() => intercomData({ address: wallet, providerType, anonId }), [wallet, providerType, anonId])

  // Held back until the session is known and belongs to this visitor, so the widget never sends this
  // account's attributes into the previous one's session.
  if (!restored || stale) return null
  return <IntercomWidget appId={appId} data={data} settings={INTERCOM_SETTINGS} />
}
