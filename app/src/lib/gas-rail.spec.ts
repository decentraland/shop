import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ethers } from 'ethers'
import { ProviderType } from '@dcl/schemas'

// Only the balance read is faked; everything else in ethers stays real, so BigNumber comparisons below are
// the ones the module actually performs. `importOriginal<T>()` rather than a cast — the cast form is what
// eslint's no-unnecessary-type-assertion strips, and tsc then fails on a spread of `unknown`.
const getBalance = vi.fn()
vi.mock('ethers', async importOriginal => {
  const actual = await importOriginal<typeof import('ethers')>()
  return {
    ...actual,
    ethers: {
      ...actual.ethers,
      providers: { ...actual.ethers.providers, JsonRpcProvider: vi.fn(() => ({ getBalance })) }
    }
  }
})

import { canOfferGasRail, hasGasMoney, MIN_NATIVE_FOR_GAS_WEI } from '~/lib/gas-rail'

const ADDRESS = '0x0000000000000000000000000000000000000001'

beforeEach(() => getBalance.mockReset())

/**
 * This rail is only ever reached because a relayed one already failed, so the question is never "is this
 * nicer" — it is "would offering it end anywhere better than the dead end it replaces".
 */
describe('hasGasMoney', () => {
  it('is true only at or above the floor', async () => {
    getBalance.mockResolvedValue(MIN_NATIVE_FOR_GAS_WEI)
    expect(await hasGasMoney(ADDRESS)).toBe(true)

    getBalance.mockResolvedValue(MIN_NATIVE_FOR_GAS_WEI.sub(1))
    expect(await hasGasMoney(ADDRESS)).toBe(false)
  })

  it('treats dust as nothing, because dust cannot pay for a transaction', async () => {
    // The reason the floor is not `> 0`: a wallet holding a fraction of a cent would be offered a switch
    // and then revert on gas — a longer dead end than the one it replaced.
    getBalance.mockResolvedValue(ethers.BigNumber.from(1))
    expect(await hasGasMoney(ADDRESS)).toBe(false)
  })

  it('answers false when the balance cannot be read', async () => {
    // An unusable answer is the same as no answer. A wrong "yes" ends in a signed transaction that reverts
    // on gas; a wrong "no" only shows the calmer of the two messages — so the guess goes that way.
    getBalance.mockResolvedValue(undefined)
    expect(await hasGasMoney(ADDRESS)).toBe(false)
  })
})

describe('canOfferGasRail', () => {
  it('never offers it to a managed wallet, and does not even ask the chain', async () => {
    // Magic/thirdweb hold no POL and have no network control: "switch to Polygon" is advice they cannot
    // act on, and network wording is what these users must never be shown at all.
    getBalance.mockResolvedValue(MIN_NATIVE_FOR_GAS_WEI)

    expect(await canOfferGasRail(ProviderType.MAGIC, ADDRESS)).toBe(false)
    expect(await canOfferGasRail(null, ADDRESS)).toBe(false)
    expect(getBalance).not.toHaveBeenCalled()
  })

  it('offers it to a funded self-custody wallet', async () => {
    getBalance.mockResolvedValue(MIN_NATIVE_FOR_GAS_WEI)
    expect(await canOfferGasRail(ProviderType.INJECTED, ADDRESS)).toBe(true)
  })

  it('withholds it from a self-custody wallet that could not pay the gas', async () => {
    getBalance.mockResolvedValue(ethers.BigNumber.from(0))
    expect(await canOfferGasRail(ProviderType.INJECTED, ADDRESS)).toBe(false)
  })
})
