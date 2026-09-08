import { ChainId } from '@dcl/schemas'

// Self-contained contract config — a minimal copy of the two entries the tool needs from
// decentraland-transactions.
//
// Why copied instead of imported: decentraland-transactions' package `exports` map only whitelists
// the barrel + `./crossChain`, and the barrel transitively requires the crossChain provider
// (`@0xsquid/sdk`, a PEER dependency that isn't present in a lean install). Both facts make the
// package unusable from a plain-Node CLI without pulling a heavy, unrelated dep. The tool only needs
// `{ address, name, version }` for the off-chain marketplace versions + MANAToken to build the EIP-712
// domain and the received asset's contractAddress — no ABI (ethers calls use inline ABIs). Values verified
// against decentraland-transactions@3.1.1 (cjs/contracts/offChainMarketplaceV2.js, offChainMarketplaceV3.js,
// manaToken.js), and pinned there by app/src/lib/migrateListingsLockstep.spec.ts.
//
// If the marketplace/MANA addresses change, update this table (or restore the package import once its
// crossChain peer dep is installed).

export enum ContractName {
  OffChainMarketplaceV2 = 'OffChainMarketplaceV2',
  OffChainMarketplaceV3 = 'OffChainMarketplaceV3',
  MANAToken = 'MANAToken',
}

export type ContractConfig = {
  address: string
  name: string
  version: string
  chainId: ChainId
}

const OFFCHAIN_MARKETPLACE_V2: Partial<Record<ChainId, ContractConfig>> = {
  [ChainId.ETHEREUM_SEPOLIA]: {
    address: '0x1b67d0e31eeb6b52d8eeed71d3616c2f5b33b8e7',
    name: 'DecentralandMarketplaceEthereum',
    version: '1.0.0',
    chainId: ChainId.ETHEREUM_SEPOLIA,
  },
  [ChainId.ETHEREUM_MAINNET]: {
    address: '0x1b67d0e31eeb6b52d8eeed71d3616c2f5b33b8e7',
    name: 'DecentralandMarketplaceEthereum',
    version: '1.0.0',
    chainId: ChainId.ETHEREUM_MAINNET,
  },
  [ChainId.MATIC_AMOY]: {
    address: '0x1b67d0e31eeb6b52d8eeed71d3616c2f5b33b8e7',
    name: 'DecentralandMarketplacePolygon',
    version: '1.0.0',
    chainId: ChainId.MATIC_AMOY,
  },
  [ChainId.MATIC_MAINNET]: {
    address: '0xa40b1d129b8906888720686f3a01921ddf37716f',
    name: 'DecentralandMarketplacePolygon',
    version: '1.0.0',
    chainId: ChainId.MATIC_MAINNET,
  },
}

const MANA_TOKEN: Partial<Record<ChainId, ContractConfig>> = {
  [ChainId.ETHEREUM_MAINNET]: {
    address: '0x0f5d2fb29fb7d3cfee444a200298f468908cc942',
    name: 'MANAToken',
    version: '1',
    chainId: ChainId.ETHEREUM_MAINNET,
  },
  [ChainId.ETHEREUM_SEPOLIA]: {
    address: '0xfa04d2e2ba9aec166c93dfeeba7427b2303befa9',
    name: 'MANAToken',
    version: '1',
    chainId: ChainId.ETHEREUM_SEPOLIA,
  },
  [ChainId.MATIC_MAINNET]: {
    address: '0xA1c57f48F0Deb89f569dFbE6E2B7f46D33606fD4',
    name: '(PoS) Decentraland MANA',
    version: '1',
    chainId: ChainId.MATIC_MAINNET,
  },
  [ChainId.MATIC_AMOY]: {
    address: '0x7ad72b9f944ea9793cf4055d88f81138cc2c63a0',
    name: 'Decentraland MANA(PoS)',
    version: '1',
    chainId: ChainId.MATIC_AMOY,
  },
}

/**
 * V3, deployed on the testnets only so far. Values verified against
 * decentraland-transactions@3.1.1 (cjs/contracts/offChainMarketplaceV3.js).
 */
const OFFCHAIN_MARKETPLACE_V3: Partial<Record<ChainId, ContractConfig>> = {
  [ChainId.ETHEREUM_SEPOLIA]: {
    address: '0x257db44ac97789c16ab277eae87dcde0c246cc9f',
    name: 'DecentralandMarketplaceEthereum',
    version: '1.0.0',
    chainId: ChainId.ETHEREUM_SEPOLIA,
  },
  [ChainId.MATIC_AMOY]: {
    address: '0x36fd1434a6c4b8ade80c9847c1d15033ce34488c',
    name: 'DecentralandMarketplacePolygon',
    version: '1.0.0',
    chainId: ChainId.MATIC_AMOY,
  },
}

const TABLES: Record<ContractName, Partial<Record<ChainId, ContractConfig>>> = {
  [ContractName.OffChainMarketplaceV2]: OFFCHAIN_MARKETPLACE_V2,
  [ContractName.OffChainMarketplaceV3]: OFFCHAIN_MARKETPLACE_V3,
  [ContractName.MANAToken]: MANA_TOKEN,
}

/**
 * Off-chain marketplace versions, newest first.
 *
 * KEEP IN LOCKSTEP with the identically-named list in `app/src/lib/marketplace.ts`. The two lists
 * cannot be shared — this tool vendors its own contract table precisely because importing
 * decentraland-transactions drags in an optional `@0xsquid/sdk` peer a lean CLI install does not have — so
 * when a new version ships, both have to be edited. A CLI signing against a version the app does not
 * authorise produces listings the app can neither settle nor take down.
 */
const OFF_CHAIN_MARKETPLACE_CONTRACT_NAMES = [ContractName.OffChainMarketplaceV3, ContractName.OffChainMarketplaceV2]

/**
 * The newest off-chain marketplace deployed on a chain.
 *
 * A migrated listing has to be signed against the same version the app grants minter rights to, or the
 * app authorises one contract while the CLI signs for another and the mint reverts. Falls back through
 * the list because a version that is not deployed on a chain simply has no entry.
 */
export function getLatestOffChainMarketplace(chainId: ChainId | number): ContractConfig {
  for (const name of OFF_CHAIN_MARKETPLACE_CONTRACT_NAMES) {
    const cfg = TABLES[name]?.[chainId as ChainId]
    if (cfg) return cfg
  }
  throw new Error(`No off-chain marketplace config for chainId ${chainId}. Add it to src/dcl-transactions.ts.`)
}

/** Drop-in for decentraland-transactions' getContract, scoped to the contracts this tool uses. */
export function getContract(name: ContractName, chainId: ChainId | number): ContractConfig {
  const cfg = TABLES[name]?.[chainId as ChainId]
  if (!cfg) throw new Error(`No ${name} config for chainId ${chainId}. Add it to src/dcl-transactions.ts.`)
  return cfg
}
