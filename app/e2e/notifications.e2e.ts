import { describe, it, expect, afterEach } from 'vitest'
import { launchApp, type App } from './helpers/app'
import { bodyText, waitForText } from './helpers/dom'

/**
 * The navbar notifications bell.
 *
 * Worth end-to-end coverage because the panel is NOT ours: it's decentraland-ui2's `Notifications`
 * feature, lazy-loaded, fed by the push-notifications service. Two failure modes have already shipped
 * from that seam — the panel white-screened on a notification whose `timestamp` date-fns couldn't parse
 * ("Invalid time value"), and it needed a MUI theme provider the shop doesn't otherwise mount. Neither
 * is reachable from a unit test with a stubbed panel, so the real component gets driven here.
 */

let app: App | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

// ui2's Notifications feature renders the bell as a plain DIV — no button, no id, no testid, no
// accessible name — so the shop wraps it to give tests something stable to click, and clicking the
// wrapper lands on the div inside it. See NotificationsBell.tsx.
const BELL = '[data-testid="notifications-bell"]'

async function openBell(page: App['page']) {
  await page.waitForSelector(BELL, { timeout: 20000 })
  await page.click(BELL)
}

/** One notification, with whatever timestamp shape the service happens to send. */
function notification(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    type: 'item_sold',
    address: '0x0000000000000000000000000000000000000001',
    timestamp: 1750000000000,
    read: false,
    created_at: 1750000000000,
    updated_at: 1750000000000,
    // ui2 renders its OWN per-type copy from this metadata (it ignores a free-text description), so
    // nftName is what actually reaches the screen — which is exactly what makes it worth asserting.
    metadata: { link: '/activity', nftName: `Item ${id}` },
    ...over
  }
}

describe('notifications bell', () => {
  it('renders in the navbar and opens the panel without crashing', async () => {
    app = await launchApp({ path: '/overview' })
    const { page } = app

    await openBell(page)
    // The panel is the assertion: a render crash inside ui2 would leave the app blank instead.
    await waitForText(page, 'Someone just bought your Nebula Jacket')
    expect(await bodyText(page)).toMatch(/notifications/i)
    // ...and the app itself is still alive behind it.
    expect(await bodyText(page)).toMatch(/overview|collectibles/i)
  })

  it('survives a notification the service sent with an unparseable date', async () => {
    // The exact shape that white-screened the panel: date-fns throws "Invalid time value" and takes the
    // whole feature down. Unrenderable items must be dropped, and the renderable ones must still show.
    app = await launchApp({
      path: '/overview',
      fixtures: {
        notifications: {
          notifications: [
            notification('bad-null', { timestamp: null, created_at: null }),
            notification('bad-text', { timestamp: 'not a date', created_at: 'not a date' }),
            notification('bad-zero', { timestamp: 0, created_at: 0 }),
            notification('good', { timestamp: 1750000000000, metadata: { link: '/activity', nftName: 'Survivor Jacket' } })
          ]
        }
      }
    })
    const { page } = app

    await openBell(page)
    await waitForText(page, 'Survivor Jacket')
    expect(await bodyText(page)).toMatch(/overview|collectibles/i)
  })

  it('accepts second-precision and ISO timestamps, not just milliseconds', async () => {
    // The service is not consistent about units; both must render rather than being silently dropped.
    app = await launchApp({
      path: '/overview',
      fixtures: {
        notifications: {
          notifications: [
            notification('secs', { timestamp: 1750000000, metadata: { link: '/activity', nftName: 'Seconds Jacket' } }),
            notification('iso', {
              timestamp: '2026-06-15T10:00:00.000Z',
              metadata: { link: '/activity', nftName: 'Iso Jacket' }
            })
          ]
        }
      }
    })
    const { page } = app

    await openBell(page)
    await waitForText(page, 'Seconds Jacket')
    expect(await bodyText(page)).toMatch(/iso jacket/i)
  })

  it('renders the bell with an empty list when the service has nothing', async () => {
    app = await launchApp({ path: '/overview', fixtures: { notifications: { notifications: [] } } })
    const { page } = app

    await openBell(page)
    // No crash, no stale content, and the page still works.
    await waitForText(page, 'Notifications')
    expect(await bodyText(page)).not.toMatch(/someone just bought/i)
    expect(await bodyText(page)).toMatch(/overview|collectibles/i)
  })

  it('still renders the bell when the notifications service fails', async () => {
    // Every call degrades to an empty list by design — a 500 from the service must not cost the user
    // their navbar.
    app = await launchApp({ path: '/overview', errors: { '/notifications': { status: 500 } } })
    const { page } = app

    await openBell(page)
    expect(await bodyText(page)).toMatch(/overview|collectibles/i)
  })

  it('is absent when signed out — there is no one to notify', async () => {
    app = await launchApp({ path: '/overview', signedOut: true })
    const { page } = app

    await waitForText(page, 'Sign in')
    expect(await page.$(BELL)).toBeNull()
  })
})
