import { describe, it, expect, afterEach } from 'vitest'
import { launchApp, type App } from './helpers/app'

let app: App | undefined
afterEach(async () => {
  // Swallowed on purpose: the guard test below closes its own app and expects the rejection.
  await app?.close().catch(() => {})
  app = undefined
})

describe('analytics stays offline during an e2e run', () => {
  it('loads a page without reaching Segment or the first party proxy', async () => {
    app = await launchApp({ path: '/' })

    await expect(app.close()).resolves.toBeUndefined()
    app = undefined
  })

  it('fails the run, and still tears down, when something does reach an analytics host', async () => {
    app = await launchApp({ path: '/' })
    const { page, browser } = app

    // Deliberately break the rule this guard exists to catch. Without the guard the harness answers
    // this request like any other unmocked external call and the run stays green.
    await page.evaluate(() => fetch('https://api.segment.io/v1/t', { method: 'POST', body: '{}' }).catch(() => {}))

    const closing = app.close()
    app = undefined
    await expect(closing).rejects.toThrow('api.segment.io')
    // Teardown happened despite the failure: a leaked browser would hang the suite.
    expect(browser.connected).toBe(false)
  })
})
