import { describe, it, expect, afterEach } from 'vitest'
import { launchApp, type App } from './helpers/app'
import { bodyText, clickByAria, clickByText, waitForText } from './helpers/dom'
import { ownedNfts } from './fixtures'

/**
 * Transferring an owned item to someone else.
 *
 * Irreversible and typed by hand, so the guardrails ARE the feature: an item sent to a malformed or
 * wrong address is gone. This drives the two rejections a user is most likely to hit (a bad address, and
 * their own) plus the happy path, against the real modal and the mock wallet.
 */

let app: App | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

const RECIPIENT = '0x' + 'ab'.repeat(20)

/** Open an owned (not listed) item's detail page and get to the transfer modal. */
async function openTransfer(page: App['page']) {
  await waitForText(page, 'Galaxy Hat #42')
  expect(await clickByAria(page, /galaxy hat #42/i)).toBe(true)
  await waitForText(page, 'Transfer')
  expect(await clickByText(page, 'button', /^transfer$/i)).toBe(true)
  await waitForText(page, 'Recipient address')
}

const OWNED = { path: '/my-assets', fixtures: { ownedNfts, importable: { data: [] } } }

describe('transferring an owned item', () => {
  it('opens from the owner actions and warns that it cannot be undone', async () => {
    app = await launchApp(OWNED)
    const { page } = app
    await openTransfer(page)

    // The irreversibility warning is the whole point of the screen; it must be on it.
    expect(await bodyText(page)).toMatch(/irreversible/i)
  })

  it('rejects a malformed address instead of letting it through', async () => {
    app = await launchApp(OWNED)
    const { page } = app
    await openTransfer(page)

    await page.type('input[aria-label="Recipient address"]', 'not-an-address')
    await waitForText(page, 'Enter a valid User ID')
    // And the action stays unavailable — the error is not merely decorative.
    const disabled = await page.$$eval('button', els =>
      els.filter(b => /^transfer$/i.test((b.textContent ?? '').trim())).map(b => b.disabled)
    )
    expect(disabled.some(d => d)).toBe(true)
  })

  it("rejects the owner's own address", async () => {
    app = await launchApp(OWNED)
    const { page } = app
    await openTransfer(page)

    // The connected address is embedded in the single-sign-on storage KEY. Not in its value: that holds
    // the throwaway ephemeral identity, whose address is a DIFFERENT one — using it would make this test
    // pass while proving nothing.
    const self = await page.evaluate(() => {
      const key = Object.keys(localStorage).find(k => k.startsWith('single-sign-on-0x'))
      return key ? key.replace('single-sign-on-', '') : ''
    })
    expect(self).toMatch(/^0x[a-fA-F0-9]{40}$/)

    await page.type('input[aria-label="Recipient address"]', self)
    await waitForText(page, 'your own address')
  })

  it('accepts a well-formed recipient and enables the action', async () => {
    // NOTE: this stops at "the action is available", not at a completed transfer. The submit goes through
    // a collection meta-transaction that the mocked wallet/relayer pair does not resolve, so driving it
    // here would either hang or need a second, parallel implementation of that path — which would test
    // the mock, not the app. The completion is covered by lib/buy's unit tests; what is NOT covered
    // anywhere else, and is covered here, is that a valid address clears the guardrails.
    app = await launchApp(OWNED)
    const { page } = app
    await openTransfer(page)

    await page.type('input[aria-label="Recipient address"]', RECIPIENT)
    expect(await bodyText(page)).not.toMatch(/enter a valid user id/i)
    expect(await bodyText(page)).not.toMatch(/your own address/i)

    const enabled = await page.$$eval('button', els =>
      els.filter(b => /^transfer$/i.test((b.textContent ?? '').trim())).some(b => !b.disabled)
    )
    expect(enabled).toBe(true)
  })
})
