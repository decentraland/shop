import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

// CreatorName (used in the line rows) resolves via useProfile — mock it so the modal renders standalone.
vi.mock('~/hooks/useProfile', () => ({ useProfile: () => ({ data: { name: 'ro' } }) }))

import { CartCheckoutModal, type CheckoutLine } from './CartCheckoutModal'
import type { CreditPack } from '~/lib/payments'

// All four packs the credits-server returns (the modal must render every one — was capped at 3).
const PACKS: CreditPack[] = [
  { id: 'pack_5', usd: 5, credits: 50 },
  { id: 'pack_10', usd: 10, credits: 100 },
  { id: 'pack_25', usd: 25, credits: 250, bestValue: true },
  { id: 'pack_50', usd: 50, credits: 500 }
]

const line: CheckoutLine = {
  item: {
    id: 'i1',
    name: 'Snowy Panama Hat',
    creator: '0x4274c2f7cf0b5ab7f9d3d2a9e3f4f5a6b7c8d9e0',
    category: 'wearable',
    rarity: 'legendary',
    network: 'MATIC',
    chainId: 80002,
    thumbnail: '',
    priceCredits: 105,
    gender: 'unisex'
  } as CheckoutLine['item'],
  priceCredits: 105,
  quantity: 1
}

function renderNoFunds() {
  return render(
    <CartCheckoutModal
      phase="nofunds"
      balanceCredits={10}
      onClose={() => {}}
      lines={[line]}
      shortfallCredits={95}
      packs={PACKS}
      selectedPack="pack_5"
      onSelectPack={() => {}}
      onBuyPacks={() => {}}
    />
  )
}

describe('CartCheckoutModal — insufficient funds', () => {
  it('renders all four credit bundles (not three)', () => {
    renderNoFunds()
    expect(screen.getAllByTestId('credit-pack')).toHaveLength(4)
    // Each pack's credit amount shows (500 = the widest, previously cut off as the 4th).
    expect(screen.getByText('500')).toBeTruthy()
  })

  it('shows the insufficient-funds warning and the resolved creator name', () => {
    const { container } = renderNoFunds()
    expect(screen.getByTestId('nofunds-warning')).toBeTruthy()
    expect(screen.getByText(/insufficient funds/i)).toBeTruthy()
    // The line's creator is shown as a resolved profile name, never the raw wallet address.
    expect(screen.getByText('By Ro')).toBeTruthy()
    expect(container.textContent).not.toContain('0x4274c2f7cf0b5ab7f9d3d2a9e3f4f5a6b7c8d9e0')
  })
})

/**
 * Multi-confirmation messaging. A basket that mixes an offchain trade with a CollectionStore mint cannot
 * settle in one transaction, so a self-custody buyer will be asked to confirm twice and has to be told.
 *
 * The gating is the point: a managed-wallet buyer confirms nothing, so surfacing "2 approvals" to them would
 * invent a step that does not exist in their flow. web2 buyers must never see the split at all.
 */
describe('CartCheckoutModal — awaiting confirmation', () => {
  function renderAwaiting(opts: { isSelfCustody: boolean; signatures?: { current: number; total: number } }) {
    return render(
      <CartCheckoutModal
        phase="processing"
        stage="awaiting-signature"
        step={2}
        total={2}
        balanceCredits={500}
        onClose={() => {}}
        isSelfCustody={opts.isSelfCustody}
        signatures={opts.signatures}
      />
    )
  }

  it('tells a self-custody buyer which of the confirmations is pending', () => {
    renderAwaiting({ isSelfCustody: true, signatures: { current: 1, total: 2 } })

    expect(screen.getByText(/1 of 2/i)).toBeInTheDocument()
  })

  it('advances the counter as each one is confirmed', () => {
    renderAwaiting({ isSelfCustody: true, signatures: { current: 2, total: 2 } })

    expect(screen.getByText(/2 of 2/i)).toBeInTheDocument()
  })

  it('keeps the single-confirmation copy when the basket needs only one', () => {
    renderAwaiting({ isSelfCustody: true, signatures: { current: 1, total: 1 } })

    // No count for the ordinary case — "1 of 1" would be noise.
    expect(screen.queryByText(/1 of 1/i)).not.toBeInTheDocument()
  })

  it('never mentions confirmations to a managed-wallet buyer, even on a split basket', () => {
    renderAwaiting({ isSelfCustody: false, signatures: { current: 1, total: 2 } })

    // They sign nothing, so the split must stay invisible: no count and no approval wording.
    expect(screen.queryByText(/of 2/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/approval/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/confirm/i)).not.toBeInTheDocument()
  })
})

/**
 * A cart checkout that broadcast a group which then failed to settle leaves that group's reservation
 * standing, so the balance is short until the reconciler resolves it. The panel used to report a plain
 * failure and offer "Try again" — a retry that cannot succeed on a balance the buyer no longer has.
 */
describe('when a failed checkout left credits reserved', () => {
  function renderHeld(heldCredits: boolean) {
    return render(
      <CartCheckoutModal
        phase="error"
        balanceCredits={200}
        onClose={() => {}}
        lines={[line]}
        message="Couldn't complete the purchase — please try again."
        heldCredits={heldCredits}
      />
    )
  }

  it('should tell the buyer the credits return on their own, and by when', () => {
    renderHeld(true)

    expect(screen.getByTestId('buy-error').textContent).toMatch(/return to your balance within 5.10 minutes/i)
  })

  it('should offer only an acknowledgement, since retrying would fail on the short balance', () => {
    renderHeld(true)

    // Queried by ROLE: the held copy itself ends with "you can try again once your credits are back",
    // so a text query matches the paragraph and would pass with the button still on screen.
    expect(screen.queryByRole('button', { name: /try again/i })).toBeNull()
    expect(screen.getByRole('button', { name: /got it/i })).toBeTruthy()
  })

  it('should keep the retry action for a failure that reserved nothing', () => {
    renderHeld(false)

    expect(screen.getByRole('button', { name: /try again/i })).toBeTruthy()
  })
})
