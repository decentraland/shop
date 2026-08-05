import { useCallback, useEffect, useMemo, useRef, useState, type FunctionComponent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { NotificationComponentByType } from 'decentraland-ui2/dist/components/Notifications/utils'
import { Icon } from '~/components/Icon'
import { useWallet } from '~/store/wallet'
import { useLocale } from '~/store/locale'
import { fetchNotifications, markNotificationsRead, type ShopNotification } from '~/lib/notifications'
import { shortAddress } from '~/lib/address'
import { t, type Locale } from '~/intl/i18n'
import * as S from './NotificationsBell.styles'

type NotificationRow = FunctionComponent<{
  notification: ShopNotification
  locale: Locale
  renderProfile: (address: string) => string
}>

// ui2's map is keyed by @dcl/schemas' NotificationType and its value type resolves to `any` through this
// build (the same typing hole lib/notifications documents), which un-types every consumer. Narrowed here
// to the props actually passed, and keyed by plain string because the service can send a type we have no
// renderer for.
const ROWS = NotificationComponentByType as unknown as Record<string, NotificationRow | undefined>

// The DCL notifications bell for the global navbar (rendered into the ui2 Navbar's `notificationSlot`).
// Address/identity-based: it reads the connected session's notifications from the push-notifications
// service (see lib/notifications) and renders them as one chronological list — the shape the marketplace
// ships (decentraland-dapps' NotificationSlot), with no seen/unseen tabs. The per-type rows are ui2's own
// renderers, so the icon, copy, inline links, relative timestamp and unread dot stay shared with every
// other DCL app; only the panel chrome is the shop's. Kept in its own module so the navbar can lazy-load
// it — those renderers pull in a lot of MUI.
export function NotificationsBell() {
  const session = useWallet(s => s.session)
  const locale = useLocale(s => s.locale)
  const qc = useQueryClient()
  const [isOpen, setIsOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const { data: fetched = [], isLoading } = useQuery({
    queryKey: ['notifications', session?.address],
    enabled: !!session,
    queryFn: () => fetchNotifications(session!.address, session!.identity),
    // Poll on a gentle cadence so a fresh sale/bid surfaces without a reload; never on window focus (the
    // app-wide default already disables that).
    staleTime: 60_000,
    refetchInterval: 60_000
  })

  // Newest first. The service sorts on its own timestamp field, but lib/notifications falls back to
  // created_at whenever that one is missing or unparseable — so the order shown is only guaranteed if we
  // sort on the value actually rendered.
  const items = useMemo(() => [...fetched].sort((a, b) => b.timestamp - a.timestamp), [fetched])
  const unreadCount = items.filter(n => !n.read).length

  // Unread notifications are marked read when the panel CLOSES, same as the marketplace. It matters more
  // here than there: the unread dot is now the only thing that separates a new notification from an old
  // one, so flipping it on open would mean nothing was ever seen as unread.
  const close = useCallback(() => {
    setIsOpen(false)
    if (!session) return
    const unread = items.filter(n => !n.read).map(n => n.id)
    if (unread.length === 0) return
    // Optimistic in the cache so the badge and the dots clear at once, then synced to the service
    // (best-effort; reconciles on the next poll).
    qc.setQueryData<ShopNotification[]>(['notifications', session.address], prev =>
      (prev ?? []).map(n => ({ ...n, read: true }))
    )
    void markNotificationsRead(session.identity, unread)
  }, [items, qc, session])

  // `close` is re-created whenever `items` changes — i.e. on every 60s poll — and the dismissal effect
  // below must not tear its listeners down and re-add them for that. The ref carries the latest `close`
  // so the effect can depend on `isOpen` alone while still marking the CURRENT unread set read.
  const closeRef = useRef(close)
  closeRef.current = close

  // Outside-click / Escape dismissal. ui2's Menu used to provide this; a plain positioned panel has to do
  // it itself — and it has to work, because closing is what marks notifications read.
  useEffect(() => {
    if (!isOpen) return
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) closeRef.current()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [isOpen])

  // The slot is only mounted by the ui2 Navbar when signed in, but guard anyway so the hooks above stay
  // unconditional while the render short-circuits for a signed-out session.
  if (!session) return null

  const label = unreadCount > 0 ? t('notifications.titleUnread', { count: unreadCount }) : t('notifications.title')

  return (
    <S.Wrap ref={wrapRef}>
      <S.Bell
        type="button"
        data-testid="notifications-bell"
        aria-label={label}
        aria-expanded={isOpen}
        onClick={() => (isOpen ? close() : setIsOpen(true))}
      >
        <Icon name="bell" size={24} data-testid="notifications-bell-icon" />
        {unreadCount > 0 ? (
          <S.Badge data-testid="notifications-badge">{unreadCount > 99 ? '99+' : unreadCount}</S.Badge>
        ) : null}
      </S.Bell>

      {isOpen ? (
        <S.Panel data-testid="notifications-panel" role="dialog" aria-label={t('notifications.title')}>
          <S.Header>
            <S.Title>{t('notifications.title')}</S.Title>
          </S.Header>
          <S.List data-testid="notifications-list">
            {isLoading && items.length === 0 ? (
              <S.Empty data-testid="notifications-loading">{t('notifications.loading')}</S.Empty>
            ) : null}
            {!isLoading && items.length === 0 ? (
              <S.Empty data-testid="notifications-empty">{t('notifications.empty')}</S.Empty>
            ) : null}
            {items.map(n => {
              const Component = ROWS[n.type]
              if (!Component) return null
              return (
                <S.Item key={n.id} data-testid="notification-item" data-unread={!n.read}>
                  <Component notification={n} locale={locale} renderProfile={shortAddress} />
                </S.Item>
              )
            })}
          </S.List>
        </S.Panel>
      ) : null}
    </S.Wrap>
  )
}

export default NotificationsBell
