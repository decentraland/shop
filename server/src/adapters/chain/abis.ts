/**
 * Minimal human-readable ABIs for the contracts the treasury reads/writes. Kept tiny on
 * purpose — only the functions actually used — to avoid ethers parsing issues and keep the
 * attack surface small.
 */

/** ERC-20 subset: balance reads + the transfer used to fund the CreditsManager. */
export const ERC20_ABI = [
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)'
]

/** Chainlink-style aggregator subset used to read MANA/USD. */
export const CHAINLINK_AGGREGATOR_ABI = [
  'function decimals() view returns (uint8)',
  'function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)'
]
