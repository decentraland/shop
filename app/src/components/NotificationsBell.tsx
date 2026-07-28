import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Notifications, NotificationActiveTab } from 'decentraland-ui2/dist/components/Notifications'
import { useWallet } from '~/store/wallet'
import { useLocale } from '~/store/locale'
import { fetchNotifications, markNotificationsRead, type ShopNotification } from '~/lib/notifications'
import { shortAddress } from '~/lib/address'

// The DCL notifications bell for the global navbar (rendered into the ui2 Navbar's `notificationSlot`).
// Address/identity-based: it reads the connected session's notifications from the push-notifications
// service (see lib/notifications) and renders ui2's own notifications UI. Kept in its own module so the
// navbar can lazy-load it — this pulls in the (heavy) ui2 Notifications feature only when needed.
export function NotificationsBell() {
  const session = useWallet(s => s.session)
  const locale = useLocale(s => s.locale)
  const qc = useQueryClient()
  const [isOpen, setIsOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<NotificationActiveTab>(NotificationActiveTab.NEWEST)

  const queryKey = ['notifications', session?.address]
  const { data: items = [], isLoading } = useQuery({
    queryKey,
    enabled: !!session,
    queryFn: () => fetchNotifications(session!.address, session!.identity),
    // Poll on a gentle cadence so a fresh sale/bid surfaces without a reload; never on window focus (the
    // app-wide default already disables that).
    staleTime: 60_000,
    refetchInterval: 60_000
  })

  // The slot is only mounted by the ui2 Navbar when signed in, but guard anyway so the hooks above stay
  // unconditional while the render short-circuits for a signed-out session.
  if (!session) return null

  function toggle() {
    const next = !isOpen
    setIsOpen(next)
    // Opening the panel marks the currently-unread notifications read — optimistically in the cache so
    // the badge clears at once, then synced to the service (best-effort; reconciles on the next poll).
    if (next) {
      const unread = items.filter(n => !n.read).map(n => n.id)
      if (unread.length > 0) {
        qc.setQueryData<ShopNotification[]>(queryKey, prev => (prev ?? []).map(n => ({ ...n, read: true })))
        void markNotificationsRead(session!.identity, unread)
      }
    }
  }

  return (
    <Notifications
      isOpen={isOpen}
      items={items}
      isLoading={isLoading}
      locale={locale}
      isOnboarding={false}
      activeTab={activeTab}
      renderProfile={address => shortAddress(address)}
      onClick={toggle}
      onChangeTab={(_e, tab) => setActiveTab(tab)}
      onBegin={() => undefined}
      onClose={() => setIsOpen(false)}
    />
  )
}

export default NotificationsBell
