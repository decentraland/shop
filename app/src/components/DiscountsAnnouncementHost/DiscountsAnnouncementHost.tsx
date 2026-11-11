import { lazy, Suspense, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useDiscountsAnnouncement } from '~/hooks/useDiscountsAnnouncement'
import { track } from '~/lib/analytics'

// Its own chunk: almost every visit never shows it, so the entry bundle should not carry it.
const DiscountsAnnouncement = lazy(() =>
  import('~/components/DiscountsAnnouncement').then(m => ({ default: m.DiscountsAnnouncement }))
)

/** Shows a creator the discounts announcement once, wherever they are in the Shop, and routes its call to action. */
export function DiscountsAnnouncementHost() {
  const location = useLocation()
  const navigate = useNavigate()
  const { collection, dismiss, hide } = useDiscountsAnnouncement(location.pathname)
  const shown = useRef<string | null>(null)

  if (!collection) return null

  return (
    <Suspense fallback={null}>
      <DiscountsAnnouncement
        collection={collection}
        onShown={() => {
          if (shown.current === collection.contractAddress) return
          shown.current = collection.contractAddress
          track('Shop Discounts Announcement Shown', { collection: collection.contractAddress })
        }}
        onClose={() => {
          track('Shop Discounts Announcement Dismissed', { collection: collection.contractAddress })
          dismiss()
        }}
        onCreate={() => {
          track('Shop Discounts Announcement Clicked', { collection: collection.contractAddress })
          // Retired for good by the store once the flow opens there, so a collection the store cannot open
          // leaves the announcement for another visit rather than spending it on nothing.
          hide()
          const qs = new URLSearchParams({ tab: 'collections', discount: collection.contractAddress })
          navigate(`/my-store?${qs.toString()}`)
        }}
      />
    </Suspense>
  )
}
