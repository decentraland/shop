import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ChainId } from '@dcl/schemas'
import { describe, expect, it } from 'vitest'
import { ContractName, getContract } from 'decentraland-transactions'
import { getLatestOffChainMarketplaceContract } from './marketplace'

/**
 * The lockstep guard for the two version lists that cannot be shared.
 *
 * `tools/migrate-listings` vendors its own contract table because importing decentraland-transactions drags
 * in an optional `@0xsquid/sdk` peer a lean CLI install does not have. That leaves a comment pair as the only
 * thing keeping it aligned with the app — and the app tracks `^3.1.1`, so a routine lockfile refresh can
 * adopt a newer registry on its own. Whichever side moves first, a listing ends up signed against one
 * marketplace while the other grants minter rights on a different one, and the mint reverts.
 *
 * The table is read as TEXT rather than imported. Importing it would make `tsc` follow into the CLI package
 * and resolve ITS dependencies, which CI never installs — the app job runs `npm ci` in `app` alone. Reading
 * the source keeps the check inside the app's own dependency graph.
 */
// Resolved from the working directory, which is `app` for both `npm test` and the CI job. import.meta.url
// is not a file: URL under the jsdom environment.
const CLI_SOURCE = readFileSync(resolve(process.cwd(), '../tools/migrate-listings/src/dcl-transactions.ts'), 'utf8')

/** The ordered candidate list the CLI resolves "latest" from. */
function cliVersionOrder(): string[] {
  const match = CLI_SOURCE.match(/const OFFCHAIN_MARKETPLACE_NAMES = \[([^\]]+)\]/)
  expect(match, 'OFFCHAIN_MARKETPLACE_NAMES not found — the CLI table was restructured, update this guard').toBeTruthy()
  return [...(match as RegExpMatchArray)[1].matchAll(/ContractName\.(\w+)/g)].map(name => name[1])
}

/** chainId → address, for one of the CLI's vendored version tables. */
function cliAddresses(constName: string): Map<number, string> {
  const block = CLI_SOURCE.match(new RegExp(`const ${constName}[^{]*\\{([\\s\\S]*?)\\n\\}`))
  expect(block, `${constName} not found — the CLI table was restructured, update this guard`).toBeTruthy()
  const entries = [...(block as RegExpMatchArray)[1].matchAll(/\[ChainId\.(\w+)\]:\s*\{\s*address:\s*'(0x[0-9a-fA-F]{40})'/g)]
  expect(entries.length, `${constName} has no parseable entries`).toBeGreaterThan(0)
  return new Map(entries.map(entry => [ChainId[entry[1] as keyof typeof ChainId] as number, entry[2].toLowerCase()]))
}

describe('when the CLI picks a marketplace to sign a migrated listing against', () => {
  it('should use the same candidate order the app resolves with', () => {
    expect(cliVersionOrder()).toEqual([ContractName.OffChainMarketplaceV3, ContractName.OffChainMarketplaceV2])
  })
})

describe.each([
  ['OFFCHAIN_MARKETPLACE_V2', ContractName.OffChainMarketplaceV2],
  ['OFFCHAIN_MARKETPLACE_V3', ContractName.OffChainMarketplaceV3]
])('when checking the addresses the CLI vendored for %s', (constName, registryName) => {
  it('should match decentraland-transactions on every chain the CLI lists', () => {
    for (const [chainId, vendored] of cliAddresses(constName)) {
      expect(getContract(registryName, chainId).address.toLowerCase(), `chain ${chainId}`).toBe(vendored)
    }
  })
})

describe.each([ChainId.MATIC_MAINNET, ChainId.MATIC_AMOY, ChainId.ETHEREUM_MAINNET, ChainId.ETHEREUM_SEPOLIA])(
  'when both sides resolve the latest marketplace on chain %s',
  chainId => {
    it('should agree, so a migrated listing settles where the app grants minter rights', () => {
      const appLatest = getLatestOffChainMarketplaceContract(chainId).address.toLowerCase()
      const order = cliVersionOrder()
      const cliLatest = order
        .map(name => cliAddresses(name === 'OffChainMarketplaceV3' ? 'OFFCHAIN_MARKETPLACE_V3' : 'OFFCHAIN_MARKETPLACE_V2').get(chainId))
        .find(Boolean)

      expect(cliLatest).toBe(appLatest)
    })
  }
)
