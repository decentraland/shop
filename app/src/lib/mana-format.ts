// Pure MANA display helpers. Deliberately SEPARATE from lib/mana (which pulls in ethers +
// decentraland-transactions for the on-chain reads) so components and pure logic can format a MANA
// amount without dragging the contract layer into their bundle — or into their tests.

/**
 * MANA wei → a JS number, for DISPLAY only.
 *
 * `Number(wei) / 1e18` loses precision above 2^53 wei-scaled — around 9,007,199 MANA. That is far beyond
 * any balance this renders (millions of dollars' worth), and every amount that gets CHARGED stays a
 * bigint end to end (see lib/payment-options). Do not route settlement math through here.
 */
export function manaWeiToNumber(wei: bigint): number {
  return Number(wei) / 1e18
}

// Compact MANA amount: thousands grouped, up to 2 decimals for sub-unit amounts (1e18 → "1",
// 1500e18 → "1,500"). Mirrors the credits display convention so both read the same.
const manaFormatter = Intl.NumberFormat('en', { maximumFractionDigits: 2 })
export function formatMana(wei: bigint): string {
  return manaFormatter.format(manaWeiToNumber(wei))
}
