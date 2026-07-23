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
    const { container } = renderNoFunds()
    expect(container.querySelectorAll('.buy-modal__pack')).toHaveLength(4)
    // Each pack's credit amount shows (500 = the widest, previously cut off as the 4th).
    expect(screen.getByText('500')).toBeTruthy()
  })

  it('shows the insufficient-funds warning and the resolved creator name', () => {
    const { container } = renderNoFunds()
    expect(container.querySelector('.buy-modal__warning')).not.toBeNull()
    expect(screen.getByText(/insufficient funds/i)).toBeTruthy()
    // The line's creator is shown as a resolved profile name, never the raw wallet address.
    expect(screen.getByText('By Ro')).toBeTruthy()
    expect(container.textContent).not.toContain('0x4274c2f7cf0b5ab7f9d3d2a9e3f4f5a6b7c8d9e0')
  })
})
