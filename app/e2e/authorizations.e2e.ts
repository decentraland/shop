import { describe, it, expect, afterEach } from 'vitest'
import { launchApp, type App } from './helpers/app'
import { bodyText, waitForText } from './helpers/dom'

/**
 * The Approvals page (/authorizations).
 *
 * This is the one screen where a user can revoke the shop's permission to move their money, so its
 * on/off state has to be read from the chain rather than assumed. The mocked RPC reports every
 * allowance as granted, which is the state that matters most to get right: an approval shown as
 * inactive when it is in fact granted would push people into re-approving something they already have.
 */

let app: App | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

describe('the approvals page', () => {
  it('lists the account-level approval and reads its state from the chain', async () => {
    app = await launchApp({ path: '/authorizations' })
    const { page } = app

    // The credits approval (letting the CreditsManager spend the balance) is always listed.
    await page.waitForSelector('[data-testid="authorization-credits"]', { timeout: 20000 })
    // The mocked allowance is max uint256 → granted. It must resolve out of "Checking…" into Active.
    await page.waitForFunction(
      () => document.querySelector('[data-testid="authorization-credits"]')?.getAttribute('data-active') === 'true',
      { timeout: 20000 }
    )
    expect(await page.$eval('[data-testid="authorization-credits"]', el => (el as HTMLElement).innerText)).toMatch(
      /\bon\b/i
    )
  })

  it('offers a toggle that reflects the current state', async () => {
    app = await launchApp({ path: '/authorizations' })
    const { page } = app

    await page.waitForSelector('[data-testid="authorization-toggle-credits"]', { timeout: 20000 })
    await page.waitForFunction(
      () => document.querySelector('[data-testid="authorization-credits"]')?.getAttribute('data-active') === 'true',
      { timeout: 20000 }
    )
    // A granted approval offers deactivation — the control must not invite re-approving what's already on.
    const label = await page.$eval('[data-testid="authorization-toggle-credits"]', el =>
      (el.getAttribute('aria-label') ?? '').toLowerCase()
    )
    expect(label).toMatch(/deactivate|turn off|revoke/)
  })

  it('survives an RPC that cannot report the approval state', async () => {
    // A dead RPC must not leave the page blank or claim a state it does not know: the row still renders.
    app = await launchApp({ path: '/authorizations', errors: { '/amoy': { status: 500 } } })
    const { page } = app

    await page.waitForSelector('[data-testid="authorization-credits"]', { timeout: 20000 })
    expect(await bodyText(page)).toMatch(/approval|authorization/i)
  })

  it('asks a signed-out visitor to sign in instead of showing an empty list', async () => {
    app = await launchApp({ path: '/authorizations', signedOut: true })
    const { page } = app

    await waitForText(page, 'Sign in')
    // No approval rows for a session that doesn't exist.
    expect(await page.$('[data-testid="authorization-credits"]')).toBeNull()
  })
})
