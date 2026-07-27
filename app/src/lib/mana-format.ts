// Pure MANA display helpers. Deliberately SEPARATE from lib/mana (which pulls in ethers +
// decentraland-transactions for the on-chain reads) so components and pure logic can format a MANA
// amount without dragging the contract layer into their bundle — or into their tests.

/** wei → whole-MANA number (lossy: display only, never on-chain math). */
export function manaWeiToNumber(wei: bigint): number {
  return Number(wei) / 1e18
}

// Compact MANA amount: thousands grouped, up to 2 decimals for sub-unit amounts (1e18 → "1",
// 1500e18 → "1,500"). Mirrors the credits display convention so both read the same.
const manaFormatter = Intl.NumberFormat('en', { maximumFractionDigits: 2 })
export function formatMana(wei: bigint): string {
  return manaFormatter.format(manaWeiToNumber(wei))
}
