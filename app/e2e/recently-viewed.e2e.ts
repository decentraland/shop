import { describe, it, expect, afterEach } from 'vitest'
import { launchApp, type App } from './helpers/app'
import { bodyText, clickByText, waitForText } from './helpers/dom'
import { COLLECTION } from './fixtures'

/**
 * VIEW HISTORY IS RECORDED BUT NO LONGER SHOWN ON THE HOME PAGE.
 *
 * This file used to assert the opposite: that visiting an item put it in a "Recently viewed" row on the
 * overview. That row was deliberately dropped — the home page leads with what the Shop is selling, and a
 * row of things you have already looked at competes with that — so the old assertions pinned behaviour the
 * redesign removes, and both of them timed out waiting for a heading that will never render.
 *
 * The recording itself was deliberately KEPT, so that is what is asserted now. It stays worth a browser
 * test for the original reason: it is written on one page and read from localStorage across a real
 * navigation and a real reload, and a store that silently never persists looks fine in a unit test.
 *
 * If the row ever comes back, the absence case below is the one to delete — not this whole file.
 */

let app: App | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

const HISTORY_KEY = 'shop:recently-viewed'

const history = (page: App['page']) =>
  page.evaluate((key: string) => {
    try {
      return JSON.parse(window.localStorage.getItem(key) ?? '[]') as { id?: string; name?: string }[]
    } catch {
      return []
    }
  }, HISTORY_KEY)

describe('view history', () => {
  it('records a viewed item, and survives an in-app navigation', async () => {
    app = await launchApp({ path: `/item/${COLLECTION}/1` })
    const { page } = app

    await waitForText(page, 'Nebula Jacket')
    // Navigate in-app (client-side) the way a shopper would, not with a hard reload.
    expect(await clickByText(page, 'a', /overview/i)).toBe(true)
    await waitForText(page, 'Trending Products')

    expect((await history(page)).map(i => i.name)).toContain('Nebula Jacket')
  })

  it('keeps the history across a full reload', async () => {
    app = await launchApp({ path: `/item/${COLLECTION}/1` })
    const { page } = app

    await waitForText(page, 'Nebula Jacket')
    await page.goto(page.url().replace(`/item/${COLLECTION}/1`, '/overview'), { waitUntil: 'networkidle2' })

    // A real reload drops in-memory state, so anything surviving here came from localStorage.
    expect((await history(page)).map(i => i.name)).toContain('Nebula Jacket')
  })

  it('does not surface the history anywhere on the home page', async () => {
    app = await launchApp({ path: `/item/${COLLECTION}/1` })
    const { page } = app

    await waitForText(page, 'Nebula Jacket')
    expect(await clickByText(page, 'a', /overview/i)).toBe(true)
    await waitForText(page, 'Trending Products')

    // Recorded (asserted above) but not rendered: no heading, and no leftover empty section either.
    expect(await history(page)).not.toHaveLength(0)
    expect(await bodyText(page)).not.toMatch(/recently viewed/i)
  })
})
