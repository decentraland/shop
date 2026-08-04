import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const session = { address: '0xabc0000000000000000000000000000000000abc' }
vi.mock('~/store/wallet', () => ({
  useWallet: (sel?: (s: { session: typeof session | null; signIn: () => void }) => unknown) =>
    sel ? sel({ session, signIn: () => {} }) : { session, signIn: () => {} }
}))
vi.mock('~/hooks/useSeo', () => ({ useSeo: () => {} }))

import { PrelaunchNotice } from './PrelaunchNotice'

describe('PrelaunchNotice', () => {
  // The curtain is the first thing a signed-in web2 visitor ever reads, and it greeted them by naming the
  // thing they do not have: a wallet. "Accounts" is true of a self-custody wallet and a managed one alike,
  // which is why this is a rewrite and not a second string gated on wallet kind.
  it('tells a signed-in visitor about early access without naming a wallet', () => {
    render(<PrelaunchNotice />)
    const notice = screen.getByTestId('prelaunch-notice')
    expect(notice.textContent).toMatch(/early access/i)
    expect(notice.textContent).not.toMatch(/wallet/i)
  })
})
