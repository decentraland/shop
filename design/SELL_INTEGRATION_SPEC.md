# SELL INTEGRATION SPEC — Decentraland "shop" web app

Integration reference for a **new** Vite + React + TypeScript "shop" app that lets a user
connect their wallet, list their owned wearables/emotes, and create a **USD-pegged**
marketplace listing (`public_nft_order`) on Amoy (chainId `80002`).

All file references are absolute paths into the sibling repos and are verified against source
(not inferred). Line numbers reflect the working tree at the time of writing.

Repos referenced:

- `decentraland-connect` — wallet connection (`/Users/juanma/Projects/dcl/decentraland-connect`)
- `decentraland-dapps` — trade signing + POST helpers (`/Users/juanma/Projects/dcl/decentraland-dapps`)
- `decentraland-transactions` — per-chain contract config (`/Users/juanma/Projects/dcl/decentraland-transactions`)
- `@dcl/schemas`, `@dcl/crypto`, `@dcl/single-sign-on-client` — types + identity (in `marketplace/webapp/node_modules`)
- `marketplace/webapp` — the legacy reference implementation (`/Users/juanma/Projects/dcl/marketplace/webapp`)
- `marketplace-server` — the NFT/trades API (`/Users/juanma/Projects/dcl/marketplace-server`)

### Dependencies to add to the shop app

```jsonc
{
  "dependencies": {
    "decentraland-connect": "*",
    "decentraland-transactions": "*",
    "@dcl/schemas": "*",
    "@dcl/crypto": "*",
    "@dcl/single-sign-on-client": "*",
    "ethers": "^5"          // ethers v5 — matches decentraland-dapps (_signTypedData, providers.Web3Provider)
    // "decentraland-dapps" is optional: you can import its trade helpers, but see Area C for why
    // you must NOT rely on its getValueForTradeAsset for USD-pegged trades.
  }
}
```

> **ethers version note:** `decentraland-dapps` and the legacy webapp use **ethers v5**
> (`ethers.providers.Web3Provider`, `signer._signTypedData`, `ethers.utils.parseEther`,
> `ethers.utils.hexZeroPad`). If the shop app uses ethers v6 the API names differ
> (`BrowserProvider`, `signer.signTypedData`, `parseEther`, `zeroPadValue`). This spec uses v5
> naming to match the reference code; adapt if you standardize on v6.

---

## A) AUTH / WALLET CONNECTION

### A.1 The `decentraland-connect` entrypoint

`decentraland-connect` exports a **singleton** `connection` (an instance of `ConnectionManager`)
and re-exports `ProviderType` / `ChainId`.

- Singleton export: `/Users/juanma/Projects/dcl/decentraland-connect/src/ConnectionManager.ts:250`
  ```ts
  export const connection = new ConnectionManager(new LocalStorage())
  ```
- Barrel exports: `/Users/juanma/Projects/dcl/decentraland-connect/src/index.ts:1-5`

Consumer import:

```ts
import { connection, ProviderType } from 'decentraland-connect'
import { ChainId } from '@dcl/schemas'
import type { ConnectionResponse, Provider } from 'decentraland-connect'
```

### A.2 `connect()` and `ConnectionResponse`

`ConnectionManager.connect` — `/Users/juanma/Projects/dcl/decentraland-connect/src/ConnectionManager.ts:27-79`

```ts
async connect(
  providerType: ProviderType,
  chainIdToConnect: ChainId = ChainId.ETHEREUM_MAINNET
): Promise<ConnectionResponse>
```

Behavior (verified):
- Disconnects any previous connector, builds the connector for `providerType`, calls `activate()`.
- For `ProviderType.INJECTED` it issues an `eth_chainId` RPC and returns the wallet's **actual**
  current chain (not `chainIdToConnect`) — lines 63-68.
- Wraps the raw provider with `ProviderAdapter.adapt(provider)` to guarantee EIP-1193 — line 74.
- Persists `{ providerType, chainId }` to `LocalStorage` (via `setConnectionData`) — line 71.

`ConnectionResponse` — `/Users/juanma/Projects/dcl/decentraland-connect/src/types.ts:43-48`

```ts
export type ConnectionResponse = {
  provider: Provider          // EIP-1193 provider (already adapted)
  providerType: ProviderType
  chainId: ChainId
  account: null | string      // NOTE: connect() returns account || '' (empty string, never null in practice)
}
```

> **Gotcha:** although the type says `null | string`, `connect()` returns `account: account || ''`
> (ConnectionManager.ts:76). Treat a falsy/empty `account` as "not connected".

Other useful methods (all on the `connection` singleton):

| Method | Signature | Ref |
| --- | --- | --- |
| `tryPreviousConnection()` | `(): Promise<ConnectionResponse>` — silent reconnect from stored data; throws if none | ConnectionManager.ts:86-111 |
| `getProvider()` | `(): Promise<Provider>` — current EIP-1193 provider | ConnectionManager.ts:142-147 |
| `disconnect()` | `(): Promise<void>` — deactivates + clears stored data | ConnectionManager.ts:124-140 |
| `getConnectionData()` | `(): ConnectionData \| undefined` = `{ providerType, chainId }` | ConnectionManager.ts:193-202 |
| `isConnected()` | `(): boolean` | ConnectionManager.ts:81-84 |

### A.3 `ProviderType`

Defined in `@dcl/schemas` and re-exported by `decentraland-connect`.
`/Users/juanma/Projects/dcl/marketplace/webapp/node_modules/@dcl/schemas/dist/dapps/provider-type.d.ts:6-18`

```ts
export enum ProviderType {
  INJECTED = 'injected',              // MetaMask / any window.ethereum
  MAGIC = 'magic',                    // Magic Link (email login) — prod
  MAGIC_TEST = 'magic_test',          // Magic Link — test env
  FORTMATIC = 'formatic',
  NETWORK = 'network',                // read-only RPC
  WALLET_CONNECT = 'wallet_connect',
  WALLET_CONNECT_V2 = 'wallet_connect_v2',
  WALLET_LINK = 'wallet_link',        // Coinbase
  METAMASK_MOBILE = 'metamask_mobile',
  AUTH_SERVER = 'auth_server',
  THIRDWEB = 'thirdweb'               // Thirdweb (email OTP / social)
}
```

Connect examples:

```ts
// MetaMask / injected — chainId arg is a hint; the actual wallet chain is returned
await connection.connect(ProviderType.INJECTED)

// Magic (email login)
await connection.connect(ProviderType.MAGIC, ChainId.MATIC_AMOY)

// Thirdweb (email OTP / social)
await connection.connect(ProviderType.THIRDWEB, ChainId.MATIC_AMOY)
```

### A.4 Getting an ethers signer / address / chainId

The `provider` in `ConnectionResponse` is EIP-1193; wrap it in `ethers.providers.Web3Provider`
to get a signer. This mirrors the legacy webapp's `getEth()`:

`/Users/juanma/Projects/dcl/marketplace/webapp/src/modules/wallet/utils.ts:28-36`

```ts
import { ethers } from 'ethers'
import { getConnectedProvider } from 'decentraland-dapps/dist/lib/eth'

export async function getEth(): Promise<ethers.providers.Web3Provider> {
  const provider = await getConnectedProvider()   // == connection.getProvider() under the hood
  if (!provider) throw new Error('Could not get a valid connected Wallet')
  return new ethers.providers.Web3Provider(provider)
}
```

For the shop app, without decentraland-dapps:

```ts
import { ethers } from 'ethers'
import { connection, ProviderType } from 'decentraland-connect'
import { ChainId } from '@dcl/schemas'

export async function connectWallet(providerType = ProviderType.INJECTED) {
  const res = await connection.connect(providerType, ChainId.MATIC_AMOY)
  if (!res.account) throw new Error('No account')

  const web3Provider = new ethers.providers.Web3Provider(res.provider)
  const signer = web3Provider.getSigner()

  return {
    address: res.account.toLowerCase(),
    chainId: res.chainId,               // number
    provider: res.provider,             // EIP-1193
    web3Provider,
    signer                              // ethers.providers.JsonRpcSigner
  }
}
```

### A.5 `@dcl/single-sign-on-client` — AuthIdentity storage

Package barrel: `/Users/juanma/Projects/dcl/marketplace/webapp/node_modules/@dcl/single-sign-on-client/dist/index.d.ts`
(re-exports `SingleSignOn` + `SingleSignOn.shared`).

Exported functions (`SingleSignOn.d.ts:3-6`, `SingleSignOn.shared.d.ts:30-32`):

```ts
init(src: string, options?): void                              // create the cross-origin SSO iframe once at startup
getIdentity(user: string): Promise<AuthIdentity | null>        // via iframe (cross-app SSO)
storeIdentity(user: string, identity: AuthIdentity): Promise<void>
clearIdentity(user: string): Promise<void>

localStorageGetIdentity(user: string): AuthIdentity | null     // local-only fallback (no iframe)
localStorageStoreIdentity(user: string, identity: AuthIdentity): void
localStorageClearIdentity(user: string): void
```

- localStorage key format: `single-sign-on-<lowercased address>`.
- `localStorageGetIdentity` parses JSON, coerces `expiration` to `Date`, and **auto-clears +
  returns null if expired** (`SingleSignOn.shared.js:28-51`).
- The `init(src)` iframe variant enables **single-sign-on across DCL apps** (marketplace,
  builder, account…). The `localStorage*` variants are per-origin only. The legacy webapp
  uses the `localStorage*` variants for read/store; use those unless you want cross-app SSO.

`AuthIdentity` (from `@dcl/crypto`,
`/Users/juanma/Projects/dcl/marketplace/webapp/node_modules/@dcl/crypto/dist/types.d.ts`):

```ts
type AuthIdentity = {
  ephemeralIdentity: { address: string; publicKey: string; privateKey: string }
  expiration: Date
  authChain: AuthLink[]   // AuthLink = { type: AuthLinkType; payload: string; signature: string }
}
```

### A.6 How the legacy webapp builds an AuthIdentity

`/Users/juanma/Projects/dcl/marketplace/webapp/src/modules/identity/sagas.ts:24-50`

```ts
function* handleGenerateIdentityRequest(action) {
  const address = action.payload.address.toLowerCase()
  const eth = yield call(getEth)                    // ethers.providers.Web3Provider (see A.4)
  const account = ethers.Wallet.createRandom()      // ephemeral keypair

  const payload = {
    address: account.address.toString(),
    publicKey: ethers.utils.hexlify(account.publicKey),
    privateKey: ethers.utils.hexlify(account.privateKey)
  }

  const signer = eth.getSigner()

  const identity = yield Authenticator.initializeAuthChain(
    address,
    payload,
    IDENTITY_EXPIRATION_IN_MINUTES,                  // default ~31 days; see utils.ts
    message => signer.signMessage(message)           // user's wallet signs the ephemeral cert
  )

  yield call(localStorageStoreIdentity, address, identity)
  yield put(generateIdentitySuccess(address, identity))
}
```

- `Authenticator.initializeAuthChain(ethAddress, ephemeralIdentity, minutes, signer)` comes from
  `@dcl/crypto` (`Authenticator.d.ts:13`). It prompts **one** `personal_sign` from the wallet
  and returns a complete signed `AuthIdentity`.
- Expiration: `IDENTITY_EXPIRATION_IN_MINUTES` — default `31 * 24 * 60` minutes
  (`/Users/juanma/Projects/dcl/marketplace/webapp/src/modules/identity/sagas.ts:14`, in `utils.ts`).
- Validity check the webapp reuses: `isValid` in
  `/Users/juanma/Projects/dcl/marketplace/webapp/src/modules/identity/utils.ts:73-75`
  → `!!identity && Date.now() < +new Date(identity.expiration)`.
- On `CONNECT_WALLET_SUCCESS` the webapp first tries `localStorageGetIdentity(address)` and only
  generates/redirects if missing (sagas.ts:60-72).

> **Note on connection:** the legacy webapp does **not** call `connection.connect` directly in
> its own code — it uses `createWalletSaga` from `decentraland-dapps`
> (`/Users/juanma/Projects/dcl/marketplace/webapp/src/modules/wallet/sagas.ts`) which wraps
> decentraland-connect and emits `CONNECT_WALLET_SUCCESS`. A fresh Vite app with no redux can
> skip all of that and call `connection.connect` + `Authenticator.initializeAuthChain` directly
> (see A.7).

### A.7 Minimal end-to-end auth for the shop app (no redux, no dapps saga)

```ts
import { ethers } from 'ethers'
import { connection, ProviderType } from 'decentraland-connect'
import { ChainId } from '@dcl/schemas'
import { Authenticator, type AuthIdentity } from '@dcl/crypto'
import { localStorageGetIdentity, localStorageStoreIdentity } from '@dcl/single-sign-on-client'

const IDENTITY_EXPIRATION_MINUTES = 31 * 24 * 60

export async function loginAndGetIdentity(providerType = ProviderType.INJECTED) {
  // 1. connect wallet
  const res = await connection.connect(providerType, ChainId.MATIC_AMOY)
  if (!res.account) throw new Error('No account')
  const address = res.account.toLowerCase()

  // 2. signer
  const web3Provider = new ethers.providers.Web3Provider(res.provider)
  const signer = web3Provider.getSigner()

  // 3. reuse stored identity if valid, else create one (1 wallet signature)
  let identity: AuthIdentity | null = localStorageGetIdentity(address)
  if (!identity) {
    const ephemeral = ethers.Wallet.createRandom()
    identity = await Authenticator.initializeAuthChain(
      address,
      {
        address: ephemeral.address,
        publicKey: ethers.utils.hexlify(ephemeral.publicKey),
        privateKey: ethers.utils.hexlify(ephemeral.privateKey)
      },
      IDENTITY_EXPIRATION_MINUTES,
      message => signer.signMessage(message)
    )
    localStorageStoreIdentity(address, identity)
  }

  return { address, chainId: res.chainId, signer, web3Provider, identity }
}
```

`identity.authChain` is what you attach to authenticated requests (see Area C for how
decentraland-dapps signs authenticated fetches; for the shop you can use
`@dcl/crypto`'s `Authenticator.signPayload` / the `decentraland-crypto-fetch` helper, or the
dapps `BaseAPI` which injects the auth-chain headers automatically).

---

## B) FETCH MY ASSETS (owned wearables/emotes)

### B.1 Endpoint

```
GET {MARKETPLACE_SERVER_URL}/v1/nfts
```

Base URL config (legacy webapp):
- prod: `https://marketplace-api.decentraland.org/v1`
  (`/Users/juanma/Projects/dcl/marketplace/webapp/src/config/env/prod.json`, key `MARKETPLACE_SERVER_URL`)
- dev/stg: `https://marketplace-api.decentraland.zone/v1`
- Read in `/Users/juanma/Projects/dcl/marketplace/webapp/src/modules/vendor/decentraland/nft/api.ts`
  as `MARKETPLACE_SERVER_URL = config.get('MARKETPLACE_SERVER_URL')`.

> The base URL already includes `/v1`, so the full path built by the client is
> `${MARKETPLACE_SERVER_URL}/nfts?...`. For **Amoy/testnet** use the `.zone` host.

For the shop, hardcode or env it:

```ts
const NFT_API = 'https://marketplace-api.decentraland.zone/v1' // testnet (Amoy/Sepolia)
// const NFT_API = 'https://marketplace-api.decentraland.org/v1' // mainnet
```

### B.2 Query params for "my assets"

Query string is built in
`/Users/juanma/Projects/dcl/marketplace/webapp/src/modules/vendor/decentraland/nft/authApi.ts`
(`buildNFTQueryString`, ~lines 166-193; `owner` mapping at ~line 176; fetch call at ~line 28).

Key params:

| Param | Meaning | Example |
| --- | --- | --- |
| `owner` | wallet address (the "my assets" filter) | `0x1234...` |
| `first` | page size | `24` |
| `skip` | offset | `0` |
| `category` | `wearable` \| `emote` \| `parcel` \| `estate` \| `ens` | `wearable` |
| `sortBy` | `newest` / `createdAt` etc. (mapped from `NFTSortBy`) | `newest` |
| `orderDirection` | `asc` \| `desc` | `desc` |
| `isOnSale` | only listed items | `true` |
| `isOnRent` | only rentable items | `true` |
| `search` | text search by name | `hat` |

Server-side parsing: `/Users/juanma/Projects/dcl/marketplace-server/src/controllers/handlers/utils.ts`
(`getNFTParams`, ~lines 71-117).

Default page params in the webapp:
`/Users/juanma/Projects/dcl/marketplace/webapp/src/modules/nft/actions.ts` (`DEFAULT_BASE_NFT_PARAMS`
= `{ first: 24, skip: 0, orderBy: CREATED_AT, orderDirection: DESC, onlyOnSale: false }`).

### B.3 Response shape

```ts
// marketplace-server: /Users/juanma/Projects/dcl/marketplace-server/src/ports/nfts/types.ts (~25-34)
// webapp mirror:      /Users/juanma/Projects/dcl/marketplace/webapp/src/modules/vendor/decentraland/nft/types.ts (~47-56)
type NFTResult = {
  nft: NFT
  order: Order | null      // active listing (see B.4)
  rental: RentalListing | null
}
type NFTResponse = { data: NFTResult[]; total: number }
```

`NFT` fields you'll read (from `@dcl/schemas` `NFT`, webapp type
`/Users/juanma/Projects/dcl/marketplace/webapp/src/modules/nft/types.ts:8-26`):

| Field | Notes |
| --- | --- |
| `id` | `"<contractAddress>-<tokenId>"` |
| `contractAddress` | ERC721 contract |
| `tokenId` | token id (string) |
| `itemId` | collection item id (string \| null) |
| `owner` | current owner |
| `name` | display name |
| `category` | `wearable` \| `emote` \| … |
| `network` | `ethereum` \| `matic` (Network enum) |
| `chainId` | numeric EIP-155 chain id |
| `image` | image URL/URN |
| `issuedId` | mint index within the collection item |
| `activeOrderId` | non-null ⇒ has an active listing (fast check) |
| `openRentalId` | non-null ⇒ has an open rental |
| `data.wearable` / `data.emote` | category-specific: `{ category, rarity, description, bodyShapes, isSmart? }` for wearables; `{ category, rarity, loop, hasSound, hasGeometry, … }` for emotes |

### B.4 Is this NFT already on sale?

Two equivalent signals in the `NFTResult`:

1. **`result.order !== null`** — the result carries the active `Order` object (with `price`,
   `status: 'open'`, `expiresAt` **in seconds**). This is what the sell UI uses.
2. **`result.nft.activeOrderId != null`** — cheap boolean check on the NFT itself.

The legacy Sell view keys off the presence of `order`:
`/Users/juanma/Projects/dcl/marketplace/webapp/src/components/ManageAssetPage/Sell/Sell.tsx`
(~lines 22-35) — if `order` exists it renders "currently selling / edit"; otherwise "list for sale".

To fetch only unlisted items: `&isOnSale=false`. Only listed: `&isOnSale=true`.

### B.5 Concrete fetch for the shop app

```ts
const NFT_API = 'https://marketplace-api.decentraland.zone/v1'

export type MyAsset = {
  id: string
  contractAddress: string
  tokenId: string
  itemId: string | null
  name: string
  category: string
  image: string
  network: string
  chainId: number
  isOnSale: boolean
  order: any | null
}

export async function fetchMyAssets(
  owner: string,
  { category = 'wearable', first = 24, skip = 0 } = {}
): Promise<{ assets: MyAsset[]; total: number }> {
  const qs = new URLSearchParams({
    owner: owner.toLowerCase(),
    category,
    first: String(first),
    skip: String(skip),
    sortBy: 'newest',
    orderDirection: 'desc'
  })
  const res = await fetch(`${NFT_API}/nfts?${qs.toString()}`)
  const { data, total } = await res.json()

  const assets: MyAsset[] = data.map((r: any) => ({
    id: r.nft.id,
    contractAddress: r.nft.contractAddress,
    tokenId: r.nft.tokenId,
    itemId: r.nft.itemId ?? null,
    name: r.nft.name,
    category: r.nft.category,
    image: r.nft.image,
    network: r.nft.network,
    chainId: r.nft.chainId,
    isOnSale: r.order != null,      // <-- already listed?
    order: r.order
  }))

  return { assets, total }
}
```

Example URL (page 1 of a wallet's wearables on testnet):

```
https://marketplace-api.decentraland.zone/v1/nfts?owner=0x1234...&category=wearable&first=24&skip=0&sortBy=newest&orderDirection=desc
```

The `GET /v1/nfts` endpoint is **public** (no auth header required) for reading owned NFTs.

---

## C) BUILD + SIGN + POST a USD-PEGGED listing (`public_nft_order`) on Amoy

### C.1 The trade objects (`@dcl/schemas`)

`/Users/juanma/Projects/dcl/marketplace/webapp/node_modules/@dcl/schemas/dist/dapps/trade.d.ts`

```ts
enum TradeType { BID='bid', PUBLIC_NFT_ORDER='public_nft_order', PUBLIC_ITEM_ORDER='public_item_order' }   // :3-7

enum TradeAssetType {                 // :27-32  — EXACT numeric values
  ERC20 = 1,
  USD_PEGGED_MANA = 2,
  ERC721 = 3,
  COLLECTION_ITEM = 4
}

type BaseTradeAsset = { assetType: TradeAssetType; contractAddress: string; extra: string }      // :37-41
type ERC20TradeAsset        = BaseTradeAsset & { assetType: TradeAssetType.ERC20;            amount: string }  // :46-49
type USDPeggedManaTradeAsset= BaseTradeAsset & { assetType: TradeAssetType.USD_PEGGED_MANA;  amount: string }  // :50-53
type ERC721TradeAsset       = BaseTradeAsset & { assetType: TradeAssetType.ERC721;           tokenId: string } // :54-57
type TradeAssetWithBeneficiary = TradeAsset & { beneficiary: string }                              // :59-61

type TradeChecks = {                  // :14-26   (expiration/effective in MILLISECONDS)
  uses: number
  expiration: number     // ms
  effective: number      // ms
  salt: string
  contractSignatureIndex: number
  signerSignatureIndex: number
  allowedRoot: string
  allowedProof?: string[]
  externalChecks: TradeExternalCheck[]
}

type TradeCreation = {                 // :75-84  (this is exactly what you POST, minus nothing)
  signer: string
  signature: string
  network: Network
  chainId: ChainId
  type: TradeType
  checks: TradeChecks
  sent: TradeAsset[]                    // the ERC721 you're selling
  received: TradeAssetWithBeneficiary[] // what you receive (USD-pegged MANA), beneficiary = seller
}
```

### C.2 USD-pegged asset layout for a sell listing

- **`sent`** = the ERC721 being sold:
  ```ts
  { assetType: TradeAssetType.ERC721, contractAddress: nft.contractAddress, tokenId: nft.tokenId, extra: '' }
  ```
- **`received`** = USD-pegged MANA, beneficiary = seller:
  ```ts
  {
    assetType: TradeAssetType.USD_PEGGED_MANA,                      // = 2
    contractAddress: '0x7ad72b9f944ea9793cf4055d88f81138cc2c63a0', // MANA on Amoy
    amount: ethers.utils.parseEther('1').toString(),               // USD value, 18 decimals ("1000000000000000000" = $1)
    extra: '',
    beneficiary: sellerAddress
  }
  ```

`amount` is a **string of the USD value with 18 decimals** — same encoding as an ERC20 amount.
The contract prices the settlement in MANA at execution time using an on-chain USD/MANA oracle;
the signed value is the USD figure.

### C.3 EIP712 domain + types (`decentraland-dapps`)

`/Users/juanma/Projects/dcl/decentraland-dapps/src/lib/trades.ts`

**Domain** (`getTradeSignature`, lines 127-145):

```ts
const marketplaceContract = getContract(ContractName.OffChainMarketplaceV2, trade.chainId)
const SALT = hexZeroPad(hexlify(trade.chainId), 32)   // salt = zero-padded chainId
const domain = {
  name:              marketplaceContract.name,        // "DecentralandMarketplacePolygon" on Amoy
  version:           marketplaceContract.version,      // "1.0.0"
  salt:              SALT,                             // 80002 -> 0x…0139a (32 bytes)
  verifyingContract: marketplaceContract.address       // 0x1b67d0e31eeb6b52d8eeed71d3616c2f5b33b8e7
}
```

For Amoy (`ChainId.MATIC_AMOY = 80002`), from
`/Users/juanma/Projects/dcl/decentraland-transactions/src/contracts/offChainMarketplaceV2.ts:19-25`:

| Domain field | Value |
| --- | --- |
| `name` | `DecentralandMarketplacePolygon` |
| `version` | `1.0.0` |
| `salt` | `hexZeroPad(hexlify(80002), 32)` = `0x000…0000139a` |
| `verifyingContract` | `0x1b67d0e31eeb6b52d8eeed71d3616c2f5b33b8e7` |

MANA on Amoy: `0x7ad72b9f944ea9793cf4055d88f81138cc2c63a0`
(`/Users/juanma/Projects/dcl/decentraland-transactions/src/contracts/manaToken.ts:50`).

> There is **no ExternalCheck / oracle address to add** to `received` for USD_PEGGED_MANA — the
> USD→MANA conversion is internal to the contract. `externalChecks: []`, `allowedRoot: '0x'`.

**Types** — `OFFCHAIN_MARKETPLACE_TYPES` (trades.ts:11-46). Note every asset's numeric value is a
single field named **`value`** (`uint256`), regardless of ERC20/ERC721/USD-pegged:

```ts
export const OFFCHAIN_MARKETPLACE_TYPES = {
  Trade: [
    { name: 'checks',   type: 'Checks' },
    { name: 'sent',     type: 'AssetWithoutBeneficiary[]' },
    { name: 'received', type: 'Asset[]' }
  ],
  Asset: [
    { name: 'assetType',       type: 'uint256' },
    { name: 'contractAddress', type: 'address' },
    { name: 'value',           type: 'uint256' },
    { name: 'extra',           type: 'bytes'   },
    { name: 'beneficiary',     type: 'address' }
  ],
  AssetWithoutBeneficiary: [
    { name: 'assetType',       type: 'uint256' },
    { name: 'contractAddress', type: 'address' },
    { name: 'value',           type: 'uint256' },
    { name: 'extra',           type: 'bytes'   }
  ],
  Checks: [
    { name: 'uses',                   type: 'uint256' },
    { name: 'expiration',             type: 'uint256' },
    { name: 'effective',              type: 'uint256' },
    { name: 'salt',                   type: 'bytes32' },
    { name: 'contractSignatureIndex', type: 'uint256' },
    { name: 'signerSignatureIndex',   type: 'uint256' },
    { name: 'allowedRoot',            type: 'bytes32' },
    { name: 'externalChecks',         type: 'ExternalCheck[]' }
  ],
  ExternalCheck: [
    { name: 'contractAddress', type: 'address' },
    { name: 'selector',        type: 'bytes4'  },
    { name: 'value',           type: 'bytes'   },
    { name: 'required',        type: 'bool'    }
  ]
}
```

### C.4 ⚠️ USD_PEGGED_MANA is NOT signable out of the box — the required client tweak

`generateTradeValues` maps each asset's numeric `value` via `getValueForTradeAsset`. That switch
**does not handle `USD_PEGGED_MANA`** — it falls through to `default` and returns `''`, which
would sign the wrong (empty) value and produce an invalid signature.

`/Users/juanma/Projects/dcl/decentraland-dapps/src/lib/trades.ts:58-70` (verified verbatim):

```ts
export function getValueForTradeAsset(asset: TradeAsset): string {
  switch (asset.assetType) {
    case TradeAssetType.ERC721:
      return asset.tokenId
    case TradeAssetType.COLLECTION_ITEM:
      return asset.itemId
    case TradeAssetType.ERC20:
      return asset.amount
    default:                                  // <-- USD_PEGGED_MANA (=2) lands here
      console.error('Invalid asset type:', asset)
      return ''                               // <-- BUG for USD-pegged: signs empty value
  }
}
```

Confirmation that the legacy webapp only ever signs **ERC20** (not USD-pegged) today:
`/Users/juanma/Projects/dcl/marketplace/webapp/src/modules/order/utils.ts:113`
(`createPublicNFTOrderTrade` → `received[0].assetType = TradeAssetType.ERC20`).

**So the shop must NOT call `decentraland-dapps`' `getTradeSignature`/`generateTradeValues` as-is
for USD-pegged trades.** Two options:

**Option 1 (recommended): fully own the signing path in the shop.** Re-implement
`generateTradeValues` with a `getValueForTradeAsset` that includes USD_PEGGED_MANA (which returns
`asset.amount`, exactly like ERC20), then sign with the same domain+types. This avoids depending
on internal dapps behavior. See C.5.

**Option 2: monkey-patch.** Not recommended — `getValueForTradeAsset` is a module-scoped function
called internally by `generateTradeValues`; you cannot cleanly override it from outside without
patching the module. Prefer Option 1.

The only real change vs ERC20 is: add `case TradeAssetType.USD_PEGGED_MANA: return asset.amount`.
Everything else (domain, types, checks encoding) is identical.

### C.5 Full shop-side implementation (self-contained signer)

```ts
import { ethers } from 'ethers'
import { ChainId, Network, TradeAssetType, TradeType, type TradeCreation } from '@dcl/schemas'
import { ContractName, getContract } from 'decentraland-transactions'

const MS_TO_S = (ms: number) => Math.floor(ms / 1000)

// USD_PEGGED_MANA-aware value extractor (the one-line fix over dapps)
function valueForAsset(asset: any): string {
  switch (asset.assetType) {
    case TradeAssetType.ERC721:          return asset.tokenId
    case TradeAssetType.COLLECTION_ITEM: return asset.itemId
    case TradeAssetType.ERC20:           return asset.amount
    case TradeAssetType.USD_PEGGED_MANA: return asset.amount   // <-- the fix
    default: throw new Error(`Unsupported assetType ${asset.assetType}`)
  }
}

// Mirrors decentraland-dapps generateTradeValues (trades.ts:72-106)
function generateTradeValues(trade: Omit<TradeCreation, 'signature'>) {
  return {
    checks: {
      uses: trade.checks.uses,
      expiration: MS_TO_S(trade.checks.expiration),
      effective: MS_TO_S(trade.checks.effective),
      salt: ethers.utils.hexZeroPad(trade.checks.salt, 32),
      contractSignatureIndex: trade.checks.contractSignatureIndex,
      signerSignatureIndex: trade.checks.signerSignatureIndex,
      allowedRoot: ethers.utils.hexZeroPad(trade.checks.allowedRoot, 32),
      externalChecks: (trade.checks.externalChecks ?? []).map(c => ({
        contractAddress: c.contractAddress,
        selector: c.selector,
        value: c.value ? c.value : '0x',
        required: c.required
      }))
    },
    sent: trade.sent.map(a => ({
      assetType: a.assetType,
      contractAddress: a.contractAddress,
      value: valueForAsset(a),
      extra: a.extra ? a.extra : '0x'
    })),
    received: trade.received.map(a => ({
      assetType: a.assetType,
      contractAddress: a.contractAddress,
      value: valueForAsset(a),
      extra: a.extra ? a.extra : '0x',
      beneficiary: (a as any).beneficiary
    }))
  }
}

const OFFCHAIN_MARKETPLACE_TYPES = {
  Trade: [
    { name: 'checks', type: 'Checks' },
    { name: 'sent', type: 'AssetWithoutBeneficiary[]' },
    { name: 'received', type: 'Asset[]' }
  ],
  Asset: [
    { name: 'assetType', type: 'uint256' },
    { name: 'contractAddress', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'extra', type: 'bytes' },
    { name: 'beneficiary', type: 'address' }
  ],
  AssetWithoutBeneficiary: [
    { name: 'assetType', type: 'uint256' },
    { name: 'contractAddress', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'extra', type: 'bytes' }
  ],
  Checks: [
    { name: 'uses', type: 'uint256' },
    { name: 'expiration', type: 'uint256' },
    { name: 'effective', type: 'uint256' },
    { name: 'salt', type: 'bytes32' },
    { name: 'contractSignatureIndex', type: 'uint256' },
    { name: 'signerSignatureIndex', type: 'uint256' },
    { name: 'allowedRoot', type: 'bytes32' },
    { name: 'externalChecks', type: 'ExternalCheck[]' }
  ],
  ExternalCheck: [
    { name: 'contractAddress', type: 'address' },
    { name: 'selector', type: 'bytes4' },
    { name: 'value', type: 'bytes' },
    { name: 'required', type: 'bool' }
  ]
}

/**
 * Build + sign a USD-pegged public_nft_order for one ERC721 on Amoy.
 * @param usdPrice  human USD value, e.g. 1 for $1
 * @param expiresAtMs  expiration timestamp in MILLISECONDS
 */
export async function createUsdPeggedListing(opts: {
  signer: ethers.providers.JsonRpcSigner    // from Area A
  web3Provider: ethers.providers.Web3Provider
  nft: { contractAddress: string; tokenId: string; network: Network; chainId: ChainId }
  usdPrice: number
  expiresAtMs: number
  fingerprint?: string   // only for composable/estate NFTs; '' otherwise
}): Promise<TradeCreation> {
  const { signer, web3Provider, nft, usdPrice, expiresAtMs, fingerprint = '' } = opts
  const seller = (await signer.getAddress())

  const market = getContract(ContractName.OffChainMarketplaceV2, nft.chainId) // Amoy: 0x1b67…b8e7
  const mana = getContract(ContractName.MANAToken, nft.chainId)               // Amoy: 0x7ad7…63a0

  // signature indices are read on-chain (revocation counters)
  const marketC = new ethers.Contract(market.address, market.abi, web3Provider)
  const contractSignatureIndex = await marketC.contractSignatureIndex()
  const signerSignatureIndex = await marketC.signerSignatureIndex(seller)

  const tradeToSign: Omit<TradeCreation, 'signature'> = {
    signer: seller,
    network: nft.network,           // Network.MATIC on Amoy
    chainId: nft.chainId,           // ChainId.MATIC_AMOY = 80002
    type: TradeType.PUBLIC_NFT_ORDER,
    checks: {
      uses: 1,
      expiration: expiresAtMs,      // ms; converted to seconds when signing
      effective: Date.now(),        // ms
      salt: ethers.utils.hexlify(Math.floor(Math.random() * 1_000_000_000_000)),
      contractSignatureIndex: (contractSignatureIndex as ethers.BigNumber).toNumber(),
      signerSignatureIndex: (signerSignatureIndex as ethers.BigNumber).toNumber(),
      allowedRoot: '0x',
      externalChecks: []
    },
    sent: [
      {
        assetType: TradeAssetType.ERC721,
        contractAddress: nft.contractAddress,
        tokenId: nft.tokenId,
        extra: fingerprint
      }
    ],
    received: [
      {
        assetType: TradeAssetType.USD_PEGGED_MANA,                 // = 2
        contractAddress: mana.address,                            // MANA on Amoy
        amount: ethers.utils.parseEther(String(usdPrice)).toString(), // USD, 18 decimals
        extra: '',
        beneficiary: seller
      }
    ]
  }

  // EIP712 domain — identical construction to dapps getTradeSignature (trades.ts:135-141)
  const SALT = ethers.utils.hexZeroPad(ethers.utils.hexlify(nft.chainId), 32)
  const domain = {
    name: market.name,               // "DecentralandMarketplacePolygon"
    version: market.version,          // "1.0.0"
    salt: SALT,
    verifyingContract: market.address // 0x1b67d0e31eeb6b52d8eeed71d3616c2f5b33b8e7
  }

  const signature = await signer._signTypedData(
    domain,
    OFFCHAIN_MARKETPLACE_TYPES,
    generateTradeValues(tradeToSign)
  )

  return { ...tradeToSign, signature }
}
```

### C.6 POST /v1/trades

`decentraland-dapps` posts the `TradeCreation` object **as-is** (JSON body) to `/v1/trades`.

- `TradesAPI.addTrade` — `/Users/juanma/Projects/dcl/decentraland-dapps/src/modules/trades/api.ts:12-24`:
  ```ts
  addTrade = async (trade: TradeCreation) =>
    this.fetch<Trade>('/v1/trades', {
      method: 'POST',
      body: JSON.stringify(trade),
      metadata: { signer: this.signer, intent: 'dcl:create-trade' }, // -> auth-chain headers
      headers: { 'Content-Type': 'application/json' }
    })
  ```
- `TradeService.addTrade` — `/Users/juanma/Projects/dcl/decentraland-dapps/src/modules/trades/TradeService.ts:18-20`
  is a thin wrapper over `TradesAPI.addTrade`.

**`POST /v1/trades` requires authentication** (unlike the read-only `GET /v1/nfts`). The request
must carry DCL **auth-chain signed headers** derived from the `AuthIdentity` from Area A, over an
intent `dcl:create-trade`. In decentraland-dapps this is handled by `BaseAPI`/`BaseClient`'s
`metadata.signer` + `signAndSendRequest` (via `decentraland-crypto-fetch` /
`Authenticator.signPayload`). For the shop, use `decentraland-crypto-fetch` (or copy the
dapps `BaseClient` signing) to attach the `x-identity-*` / auth-chain headers using
`identity.authChain` and the ephemeral key.

**Exact POST body** (a signed USD-pegged listing on Amoy):

```jsonc
POST https://marketplace-api.decentraland.zone/v1/trades
Content-Type: application/json
// + DCL auth-chain headers signed with the AuthIdentity (intent: dcl:create-trade)

{
  "signer": "0xSELLER...",
  "signature": "0x<eip712 signature>",
  "network": "MATIC",
  "chainId": 80002,
  "type": "public_nft_order",
  "checks": {
    "uses": 1,
    "expiration": 1735689600000,          // ms
    "effective": 1704067200000,           // ms
    "salt": "0x0e1f...",
    "contractSignatureIndex": 0,
    "signerSignatureIndex": 0,
    "allowedRoot": "0x",
    "externalChecks": []
  },
  "sent": [
    {
      "assetType": 3,                       // ERC721
      "contractAddress": "0xCOLLECTION...",
      "tokenId": "42",
      "extra": ""
    }
  ],
  "received": [
    {
      "assetType": 2,                       // USD_PEGGED_MANA
      "contractAddress": "0x7ad72b9f944ea9793cf4055d88f81138cc2c63a0",
      "amount": "1000000000000000000",      // $1, 18 decimals
      "extra": "",
      "beneficiary": "0xSELLER..."
    }
  ]
}
```

> Before listing, the seller must also have **approved the OffChainMarketplaceV2 contract**
> (`0x1b67…b8e7`) as operator for the ERC721 (`setApprovalForAll(market, true)`), exactly as the
> legacy on-chain/offchain sell flow requires. The trade signature alone does not grant transfer
> rights.

### C.7 Amoy config summary

| Item | Value |
| --- | --- |
| Chain | `ChainId.MATIC_AMOY = 80002`, `Network.MATIC` |
| OffChainMarketplaceV2 (verifyingContract) | `0x1b67d0e31eeb6b52d8eeed71d3616c2f5b33b8e7` |
| MANA token | `0x7ad72b9f944ea9793cf4055d88f81138cc2c63a0` |
| EIP712 domain.name | `DecentralandMarketplacePolygon` |
| EIP712 domain.version | `1.0.0` |
| EIP712 domain.salt | `hexZeroPad(hexlify(80002), 32)` = `0x…0139a` |
| NFT/trades API (testnet) | `https://marketplace-api.decentraland.zone/v1` |

---

## Key file reference index

| Concern | File | Lines |
| --- | --- | --- |
| `connection` singleton | `decentraland-connect/src/ConnectionManager.ts` | 250 |
| `connect()` | `decentraland-connect/src/ConnectionManager.ts` | 27-79 |
| `ConnectionResponse` | `decentraland-connect/src/types.ts` | 43-48 |
| `ProviderType` | `@dcl/schemas/dist/dapps/provider-type.d.ts` | 6-18 |
| `getEth()` (provider→signer) | `marketplace/webapp/src/modules/wallet/utils.ts` | 28-36 |
| Identity generation | `marketplace/webapp/src/modules/identity/sagas.ts` | 24-50 |
| SSO client exports | `@dcl/single-sign-on-client/dist/SingleSignOn(.shared).d.ts` | — |
| NFT query builder (`owner`) | `marketplace/webapp/src/modules/vendor/decentraland/nft/authApi.ts` | ~28, 166-193 |
| NFT response type | `marketplace-server/src/ports/nfts/types.ts` | ~25-34 |
| "is on sale" (Sell view) | `marketplace/webapp/src/components/ManageAssetPage/Sell/Sell.tsx` | ~22-35 |
| `TradeCreation` / `TradeAssetType` | `@dcl/schemas/dist/dapps/trade.d.ts` | 27-84 |
| EIP712 types + domain + sign | `decentraland-dapps/src/lib/trades.ts` | 11-46, 127-145 |
| `getValueForTradeAsset` (no USD case) | `decentraland-dapps/src/lib/trades.ts` | 58-70 |
| `generateTradeValues` | `decentraland-dapps/src/lib/trades.ts` | 72-106 |
| POST /v1/trades | `decentraland-dapps/src/modules/trades/api.ts` | 12-24 |
| OffChainMarketplaceV2 Amoy config | `decentraland-transactions/src/contracts/offChainMarketplaceV2.ts` | 19-25 |
| MANA Amoy config | `decentraland-transactions/src/contracts/manaToken.ts` | 50 |
| Legacy sell trade builder (ERC20) | `marketplace/webapp/src/modules/order/utils.ts` | 80-123 (assetType at 113) |
