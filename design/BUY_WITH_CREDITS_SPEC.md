# Buy a Listed NFT with DCL Credits — Implementation Spec (Amoy / chainId 80002)

Target: a NEW **non-redux Vite + React "shop" app**. Goal: buy a listed NFT
(an OffChainMarketplaceV2 `Trade`) by calling `CreditsManager.useCredits(args)`,
which internally runs `marketplace.accept([trade])` and spends the buyer's
credits. This is the exact same on-chain path the marketplace webapp uses via
`decentraland-dapps`' `CreditsService.useCreditsMarketplace()`, reimplemented
here with plain `ethers` (no redux, no sagas, no decentraland-dapps).

Everything below is extracted from the real repos with `file:line` refs so you
can verify. Values are copy-pasteable.

---

## 0. TL;DR of the flow

1. Buyer signs in → you have a `signer` (ethers) and an **identity** (for
   signed-fetch to the credits server).
2. `getUserCredits(address, identity)` → `GET /users/:address/credits`
   (signed-fetch). Returns `{ credits: Credit[], totalCredits, totals }`.
3. (Dev only) `devMintCredit(address)` → `POST /dev/mint-credit` grants a test
   credit so you have something to spend.
4. `buildUseCreditsArgs({ trade, buyer, credits, maxCreditedValue })`:
   - Map each server credit → on-chain `Credit { value, expiresAt, salt }` and
     collect its `signature` into `creditsSignatures[]`.
   - Build the `accept([onChainTrade])` calldata (beneficiary of the *sent*
     assets = buyer) → this is `externalCall.data`.
   - `externalCall = { target: marketplaceAddr, selector: acceptSelector, data,
     expiresAt: now+24h, salt: random32 }`.
   - `customExternalCallSignature = '0x'` (self-owned credits, no server sig).
   - `maxCreditedValue = tradePrice`; `maxUncreditedValue = max(0, price − Σ availableAmount)`.
5. `submitBuy(signer, args)`: `getContract(ContractName.CreditsManager, 80002)`,
   build an `ethers.Contract`, call `useCredits(args)`.

**Selector note:** the marketplace path in dapps encodes the `accept` calldata
as **selector + raw ABI-encoded tuple** (`getSighash('accept')` +
`defaultAbiCoder.encode([...], [[onChainTrade]])`), NOT
`Interface.encodeFunctionData`. We reproduce that exactly. (Both produce the same
bytes: `selector || abi.encode(...)`. Using `encodeFunctionData('accept', [[trade]])`
is equivalent and simpler — see the alternative note in `buildAcceptCalldata`.)

---

## 1. Prerequisites (must be true on Amoy before a buy succeeds)

- **CreditsManager funded with test MANA.** `useCredits` pulls MANA from the
  CreditsManager to pay the marketplace on the buyer's behalf, then debits the
  credit. The manager contract must hold enough test MANA. Address below.
- **credits-server signer holds `CREDITS_SIGNER_ROLE`.** The wallet configured
  as `PRIVATE_KEY` in credits-server signs credit grants; the CreditsManager
  only accepts credit signatures from a wallet that has the signer role on-chain.
  If dev-minted credits get reverted with a signature error, this role is the
  cause. (There is no env var literally named `CREDITS_SIGNER` /
  `CREDITS_SIGNER_ROLE` — the key is `PRIVATE_KEY`; the *role* is granted
  on-chain to that key's address.)
- **A real, still-open listing exists** on OffChainMarketplaceV2 (Amoy) whose
  `Trade` object you can fetch from the marketplace `signatures-server` /
  `/v1/trades`. `useCredits` runs `accept([trade])`, so the trade must be valid,
  unexpired, and not already consumed.
- The buyer must have enough credit `availableAmount` (+ optional MANA top-up up
  to `maxUncreditedValue`) to cover `price`.

### Addresses / config (Amoy = ChainId.MATIC_AMOY = 80002)

| Thing | Value | Source |
|---|---|---|
| CreditsManager (Amoy) | `0x8052a560e6e6ac86eeb7e711a4497f639b322fb3` | `decentraland-transactions/src/contracts/creditsManager.ts:8` |
| CreditsManager (Mainnet, ref) | `0x8b3a40ca1b6f5cafc99d112a4d02e897d1fd8cc5` | `…/creditsManager.ts:15` |
| `ContractName.CreditsManager` | `'CreditsManager'` | `decentraland-transactions/src/types.ts:69` |
| Marketplace (per-trade) | `getContract(getContractName(trade.contract), trade.chainId).address` | `decentraland-dapps/dist/lib/credits.js:149-151` |
| credits-server local port | `3000` (`HTTP_SERVER_PORT`) | `credits-server/.env.default:11` |

Resolve the manager with `getContract(ContractName.CreditsManager, 80002)` from
`decentraland-transactions` — returns `{ address, abi, chainId, version, name }`
(`decentraland-transactions/src/contracts/index.ts:63-79`). Its `.abi` is the
full CreditsManager ABI, so you can hand it straight to `new ethers.Contract`.

---

## 2. credits-server endpoints

Repo: `/Users/juanma/Projects/dcl/credits-server`. Base URL local:
`http://localhost:3000`.

> ⚠️ `src/controllers/routes.ts` currently has an **unresolved git merge
> conflict** (markers around lines 101/137/144). The `/dev/mint-credit` route is
> on the stashed side; resolve the conflict in the server checkout before it
> compiles.

### 2.1 `GET /users/:address/credits` — signed-fetch REQUIRED

- Registered: `router.get('/users/:address/credits', signedFetchMiddleware, getUserCreditsHandler)`
  — `credits-server/src/controllers/routes.ts:65`.
- Auth: **ADR-44 signed-fetch, non-optional** (`wellKnownComponents({ optional: false })`,
  `routes.ts:51-59`). The handler also enforces `params.address === verification.auth`
  or returns `403` (`get-user-credits.ts:30-35`). Scene-originated requests are
  rejected.
- Optional query: `?status=` (default `[AVAILABLE, PARTIALLY_USED]`,
  `get-user-credits.ts:18-21`).
- **200 response** (`get-user-credits.ts:71-80`):

```jsonc
{
  "credits": [
    {
      "id": "…",                 // string — used as the on-chain `salt` (bytes32-padded)
      "userAddress": "0x…",
      "amount": "100000000000000000000",   // bigint-as-string wei — the on-chain `value`
      "availableAmount": "100000000000000000000", // amount − consumed, floored at 0
      "status": "available",     // available | partially_used | fully_used
      "contract": "0x8052…fb3",  // the CreditsManager address these credits belong to
      "timestamp": 1719_000_000_000,       // ms
      "signature": "0x…",        // per-credit sig → goes into creditsSignatures[]
      "seasonId": 1,
      "goalId": null,
      "expiresAt": 1725_000_000, // unix SECONDS — the on-chain `expiresAt`
      "claimedAt": null,
      "weekId": null,
      "creditSource": "on_demand" // goal | on_demand | iap
    }
  ],
  "totalCredits": 100,           // number, total in ETHER units (not wei)
  "totals": { "expiring": 100, "nonExpiring": 0 }
}
```

Per-credit type = `UserCredits` (`credits-server/src/types/entities.ts:120-146`).
The three fields you need on-chain: `amount` → `value`, `expiresAt` (seconds) →
`expiresAt`, `id` → `salt` (padded to bytes32), plus `signature`. Balances are
computed on read by joining against the Squid consumption index
(`credits-server/src/adapters/db/db.ts:167-233`); the server never mutates
balances itself — spending is reflected once the on-chain `useCredits` event is
indexed.

### 2.2 `POST /dev/mint-credit` — NO auth, dev only

- Registered only when `ALLOW_DEV_MINT=true`:
  `router.post('/dev/mint-credit', devMintCreditHandler)` —
  `credits-server/src/controllers/routes.ts:141-143`. `.env` has
  `ALLOW_DEV_MINT=true`.
- No middleware / no auth (`dev-mint-credit.ts`).
- **Body:** `{ address: string; amount?: number; reason?: string }`
  (`dev-mint-credit.ts:24`). Defaults `amount=100`, `reason='local dev mint'`.
  `address` required + `EthAddress.validate` (else 400).
- Calls `creditsGranter.grantOnDemandCredits(address, address, amount, reason)`
  (`dev-mint-credit.ts:42`).
- **201 response** (`GrantCreditsResult`,
  `credits-server/src/types/components.ts:271-279`):

```jsonc
{ "signature": "0x…", "expiresAt": 1725000000, "season": "…", "seasonId": 1, "creditId": "…" }
```

This is how the shop user grants themselves a spendable test credit. After
minting, re-fetch `GET /users/:address/credits` to get the full credit object
(with `amount`/`availableAmount`) to spend.

### 2.3 `POST /sign-external-call` — NOT needed for this buy

- Registered: `routes.ts:78-82` (AJV schema validation only, no signed-fetch,
  no bearer).
- Signs the on-chain `ExternalCall` struct with `EXTERNAL_CALL_SIGNER_PRIVATE_KEY`
  (`credits-server/src/logic/signer.ts:139-183`): `keccak256(abi.encode(userAddress,
  chainId, creditsManagerAddress, externalCall))`.
- **When you need it:** only when the external call target/selector is NOT one
  the CreditsManager auto-trusts for self-owned credits — e.g. collection
  publishing (`CollectionManager`) or arbitrary cross-chain calls. For **buying a
  listed NFT with your own credits** you do **NOT** call this;
  `customExternalCallSignature` is `'0x'`. (Confirmed: dapps'
  `useCreditsMarketplace` → `executeUseCredits` hardcodes `'0x'`,
  `decentraland-dapps/dist/lib/credits.js:88`.)

---

## 3. CreditsManager ABI — the exact `useCredits` args

`decentraland-transactions/src/abis/CreditsManager.ts:1582-1623`. Single-arg
function `useCredits(UseCreditsArgs _args)`.

### `UseCreditsArgs` tuple — field ORDER (this order matters for ethers)

1. `credits` — `tuple[]` of `Credit { value uint256, expiresAt uint256, salt bytes32 }`
2. `creditsSignatures` — `bytes[]`
3. `externalCall` — `tuple { target address, selector bytes4, data bytes, expiresAt uint256, salt bytes32 }`
4. `customExternalCallSignature` — `bytes`
5. `maxUncreditedValue` — `uint256`
6. `maxCreditedValue` — `uint256`

Solidity confirmation (`offchain-marketplace-contract/src/credits/CreditsManagerPolygon.sol`):

```solidity
// lines 134-141
struct UseCreditsArgs {
    Credit[] credits;
    bytes[] creditsSignatures;
    ExternalCall externalCall;
    bytes customExternalCallSignature;
    uint256 maxUncreditedValue;
    uint256 maxCreditedValue;
}
// lines 146-150
struct Credit { uint256 value; uint256 expiresAt; bytes32 salt; }
// lines 159-165
struct ExternalCall { address target; bytes4 selector; bytes data; uint256 expiresAt; bytes32 salt; }
// line 396
function useCredits(UseCreditsArgs calldata _args) external nonReentrant whenNotPaused { … }
```

When calling with ethers using the contract ABI, pass a single object whose keys
match the ABI component names (ethers matches named tuple components by name;
order still recommended):

```js
contract.useCredits({
  credits,                       // [{ value, expiresAt, salt }, …]
  creditsSignatures,             // ['0x…', …]
  externalCall,                  // { target, selector, data, expiresAt, salt }
  customExternalCallSignature,   // '0x'
  maxUncreditedValue,            // string/number wei
  maxCreditedValue               // string/number wei
})
```

---

## 4. How the marketplace encodes `accept(Trade[])` (verified)

The real logic lives in `decentraland-dapps`' `CreditsService`
(`marketplace/webapp/node_modules/decentraland-dapps/dist/lib/credits.js`).
Marketplace app entry: `webapp/src/modules/order/sagas.ts:160`
(`useCreditsMarketplace(trade, wallet.address, credits.credits)`).

Key excerpt — `prepareCreditsMarketplace` (`credits.js:145-179`):

```js
const marketplaceContract = getContract(getContractName(trade.contract), trade.chainId)
const marketplaceInterface = new Interface(marketplaceContract.abi)
const acceptSelector = marketplaceInterface.getSighash('accept')          // externalCall.selector
const onChainTrade = getOnChainTrade(trade, walletAddress)                // beneficiary = buyer
const acceptData = defaultAbiCoder.encode([TRADE_TUPLE_ARRAY], [[onChainTrade]])
const externalCall = prepareExternalCall({ target: marketplaceContract.address, selector: acceptSelector, data: acceptData })
// externalCall.data submitted on-chain = data (ABI-encoded tuple[]).  See note below.
```

- `getOnChainTrade(trade, buyer)` sets the *sent* assets' `beneficiary` to the
  buyer (`webapp/src/utils/trades.ts:118-135`, esp. 129-133) and flattens
  `checks.allowedProof = []`.
- `externalCall`: `expiresAt = now + 24h`, `salt = randomBytes(32)`
  (`credits.js:48-61`).
- `maxCreditedValue = getTradePrice(trade)` (the ERC20 `amount` in
  `trade.received`, `credits.js:238-245`); `maxUncreditedValue =
  max(0, price − Σ credit.availableAmount)` (`credits.js:68-72`).
- Submit: `sendTransaction(contract, 'useCredits', useCreditsArgs)` where
  `contract = getContract(ContractName.CreditsManager-equivalent, chainId)`;
  dapps' `sendTransaction` sends directly when the connected chain matches, else
  a meta-tx (`…/wallet/utils/sendTransaction.js:25-88`). For the shop we submit
  a **direct** `signer.useCredits(...)` on Amoy.

The on-chain `Trade` tuple (used both as the `accept` ABI param and the value in
`externalCall.data`) — full type string from `credits.js:158`:

```
tuple(
  address signer,
  bytes signature,
  tuple(
    uint256 uses, uint256 expiration, uint256 effective, bytes32 salt,
    uint256 contractSignatureIndex, uint256 signerSignatureIndex,
    bytes32 allowedRoot, bytes32[] allowedProof,
    tuple(address contractAddress, bytes4 selector, bytes value, bool required)[] externalChecks
  ) checks,
  tuple(uint256 assetType, address contractAddress, uint256 value, address beneficiary, bytes extra)[] sent,
  tuple(uint256 assetType, address contractAddress, uint256 value, address beneficiary, bytes extra)[] received
)
```

---

## 5. Copy-pasteable SHOP code (plain ethers v5, no redux)

> Uses `ethers` v5 (`BigNumber`, `utils`, `Contract`) and
> `decentraland-transactions` (`getContract`, `getContractName`, `ContractName`)
> — same libs the marketplace uses. Signed-fetch uses `@dcl/crypto` +
> `decentraland-crypto-fetch` (or your identity's `signFetchRequest`). Adjust
> imports to your shop's identity helper.

### 5.1 Constants

```ts
// src/lib/credits/constants.ts
import { ChainId, ContractName, getContract } from 'decentraland-transactions'

export const CHAIN_ID = ChainId.MATIC_AMOY // 80002
export const CREDITS_SERVER_URL =
  import.meta.env.VITE_CREDITS_SERVER_URL ?? 'http://localhost:3000'

// { address: '0x8052…fb3', abi: CreditsManager ABI, chainId: 80002, … }
export const creditsManager = getContract(ContractName.CreditsManager, CHAIN_ID)
```

### 5.2 `getUserCredits(address, identity)` — signed-fetch GET

```ts
// src/lib/credits/getUserCredits.ts
import { createFetchComponent } from '@well-known-components/fetch-component' // or your fetch
import { CREDITS_SERVER_URL } from './constants'

export type ServerCredit = {
  id: string
  userAddress: string
  amount: string           // wei, bigint-as-string -> on-chain `value`
  availableAmount: string  // wei
  status: 'available' | 'partially_used' | 'fully_used'
  contract: string         // CreditsManager address
  timestamp: number
  signature: string        // -> creditsSignatures[]
  seasonId: number | null
  goalId: string | null
  expiresAt: number        // UNIX SECONDS -> on-chain `expiresAt`
  claimedAt: number | null
  weekId: number | null
  creditSource: 'goal' | 'on_demand' | 'iap'
}

export type UserCreditsResponse = {
  credits: ServerCredit[]
  totalCredits: number     // ETHER units (not wei)
  totals: { expiring: number; nonExpiring: number }
}

// `identity` = an AuthIdentity (from @dcl/crypto). `signFetch` produces the
// ADR-44 signed-fetch headers the server's signedFetchMiddleware requires.
// Reuse whatever your shop already uses for authenticated marketplace calls.
export async function getUserCredits(
  address: string,
  signFetch: (path: string, init: RequestInit) => Promise<RequestInit>
): Promise<UserCreditsResponse> {
  const path = `/users/${address.toLowerCase()}/credits`
  const init = await signFetch(path, { method: 'GET' }) // adds Authorization/x-identity headers
  const res = await fetch(`${CREDITS_SERVER_URL}${path}`, init)
  if (!res.ok) throw new Error(`getUserCredits ${res.status}: ${await res.text()}`)
  return res.json()
}
```

> The server requires `params.address === recovered signer`, so `address` MUST be
> the same wallet that signs the fetch (`get-user-credits.ts:30-35`).

### 5.3 `devMintCredit(address)` — dev grant (no auth)

```ts
// src/lib/credits/devMintCredit.ts
import { CREDITS_SERVER_URL } from './constants'

export type DevMintResult = {
  signature: string
  expiresAt: number
  season: string | null
  seasonId: number | null
  creditId: string
}

// Requires ALLOW_DEV_MINT=true on the local credits-server. NEVER call in prod.
export async function devMintCredit(
  address: string,
  amount = 100,
  reason = 'shop dev mint'
): Promise<DevMintResult> {
  const res = await fetch(`${CREDITS_SERVER_URL}/dev/mint-credit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address: address.toLowerCase(), amount, reason })
  })
  if (!res.ok) throw new Error(`devMintCredit ${res.status}: ${await res.text()}`)
  return res.json() // 201
}
```

### 5.4 `buildAcceptCalldata(trade, buyer)` — encode accept + beneficiary=buyer

```ts
// src/lib/credits/buildAcceptCalldata.ts
import { utils } from 'ethers'
import type { Trade } from '@dcl/schemas'

const { defaultAbiCoder, Interface } = utils

// Full on-chain Trade tuple[] type — matches decentraland-dapps credits.js:158
const TRADE_TUPLE_ARRAY =
  'tuple(' +
  'address signer,' +
  'bytes signature,' +
  'tuple(uint256 uses,uint256 expiration,uint256 effective,bytes32 salt,' +
  'uint256 contractSignatureIndex,uint256 signerSignatureIndex,' +
  'bytes32 allowedRoot,bytes32[] allowedProof,' +
  'tuple(address contractAddress,bytes4 selector,bytes value,bool required)[] externalChecks) checks,' +
  'tuple(uint256 assetType,address contractAddress,uint256 value,address beneficiary,bytes extra)[] sent,' +
  'tuple(uint256 assetType,address contractAddress,uint256 value,address beneficiary,bytes extra)[] received' +
  ')[]'

// Port of webapp/src/utils/trades.ts getOnChainTrade(): beneficiary of `sent`
// assets := buyer; allowedProof flattened to [].
function getOnChainTrade(trade: Trade, buyer: string) {
  const val = (a: any) => (a.value != null ? a.value.toString() : '0')
  return {
    signer: trade.signer,
    signature: trade.signature,
    checks: {
      uses: trade.checks.uses,
      expiration: trade.checks.expiration,
      effective: trade.checks.effective,
      salt: trade.checks.salt,
      contractSignatureIndex: trade.checks.contractSignatureIndex,
      signerSignatureIndex: trade.checks.signerSignatureIndex,
      allowedRoot: trade.checks.allowedRoot ?? '0x' + '0'.repeat(64),
      allowedProof: [],
      externalChecks: (trade.checks.externalChecks ?? []).map(c => ({
        contractAddress: c.contractAddress,
        selector: c.selector,
        value: c.value,
        required: c.required
      }))
    },
    sent: trade.sent.map(a => ({
      assetType: a.assetType,
      contractAddress: a.contractAddress,
      value: val(a),
      beneficiary: buyer, // <-- buyer receives the NFT
      extra: a.extra ?? '0x'
    })),
    received: trade.received.map(a => ({
      assetType: a.assetType,
      contractAddress: a.contractAddress,
      value: val(a),
      beneficiary: a.beneficiary,
      extra: a.extra ?? '0x'
    }))
  }
}

// Returns { selector, data } exactly as dapps builds it (credits.js:155-160):
//   selector = getSighash('accept'); data = defaultAbiCoder.encode([tuple[]], [[trade]])
export function buildAcceptCalldata(trade: Trade, buyer: string, marketplaceAbi: any) {
  const iface = new Interface(marketplaceAbi)
  const selector = iface.getSighash('accept')
  const onChainTrade = getOnChainTrade(trade, buyer)
  const data = defaultAbiCoder.encode([TRADE_TUPLE_ARRAY], [[onChainTrade]])
  return { selector, data }
  // Equivalent one-liner: const data = iface.encodeFunctionData('accept', [[onChainTrade]])
  //   -> already includes the selector; if you use that, set externalCall.selector
  //      to the first 4 bytes and externalCall.data to the SAME full calldata is WRONG.
  //      The manager expects selector separate + data = raw-encoded args, so prefer
  //      the defaultAbiCoder form above.
}
```

### 5.5 `buildUseCreditsArgs({ trade, buyer, credits, maxCreditedValue })`

```ts
// src/lib/credits/buildUseCreditsArgs.ts
import { BigNumber, utils } from 'ethers'
import { getContract, getContractName } from 'decentraland-transactions'
import type { Trade } from '@dcl/schemas'
import type { ServerCredit } from './getUserCredits'
import { buildAcceptCalldata } from './buildAcceptCalldata'

const { hexZeroPad, hexlify, randomBytes } = utils

// server credit `id` -> bytes32 salt (matches dapps credits.js:22-30)
function idToSalt(id: string): string {
  if (!id) return '0x' + '0'.repeat(64)
  return id.startsWith('0x')
    ? hexZeroPad(id, 32)
    : hexZeroPad('0x' + Buffer.from(id).toString('hex'), 32)
}

export type UseCreditsArgs = {
  credits: { value: string; expiresAt: number; salt: string }[]
  creditsSignatures: string[]
  externalCall: { target: string; selector: string; data: string; expiresAt: number; salt: string }
  customExternalCallSignature: string
  maxUncreditedValue: string
  maxCreditedValue: string
}

export function buildUseCreditsArgs(params: {
  trade: Trade
  buyer: string
  credits: ServerCredit[]        // from getUserCredits — spend these
  maxCreditedValue: string       // trade price in wei (ERC20 amount in trade.received)
}): UseCreditsArgs {
  const { trade, buyer, credits, maxCreditedValue } = params

  // 1. Resolve the marketplace contract for this trade (OffChainMarketplaceV2 on Amoy)
  const marketplace = getContract(getContractName(trade.contract), trade.chainId)

  // 2. accept([onChainTrade]) calldata; beneficiary = buyer
  const { selector, data } = buildAcceptCalldata(trade, buyer, marketplace.abi)

  // 3. externalCall (expiresAt now+24h, random salt) — credits.js:48-61
  const externalCall = {
    target: marketplace.address,
    selector,
    data,
    expiresAt: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
    salt: hexlify(randomBytes(32))
  }

  // 4. on-chain Credit[] + signatures — credits.js:15-42
  const onChainCredits = credits.map(c => ({
    value: c.amount,               // wei
    expiresAt: Number(c.expiresAt), // seconds
    salt: idToSalt(c.id)
  }))
  const creditsSignatures = credits.map(c => c.signature)

  // 5. maxUncreditedValue = max(0, price - Σ availableAmount) — credits.js:68-72
  const sumAvailable = credits.reduce(
    (acc, c) => acc.add(BigNumber.from(c.availableAmount)),
    BigNumber.from(0)
  )
  const uncredited = BigNumber.from(maxCreditedValue).sub(sumAvailable)
  const maxUncreditedValue = uncredited.isNegative() ? '0' : uncredited.toString()

  return {
    credits: onChainCredits,
    creditsSignatures,
    externalCall,
    customExternalCallSignature: '0x', // self-owned credits, no server sig
    maxUncreditedValue,
    maxCreditedValue                    // = trade price
  }
}
```

### 5.6 `submitBuy(signer, args)` — direct `useCredits` on Amoy

```ts
// src/lib/credits/submitBuy.ts
import { Contract } from 'ethers'
import type { Signer } from 'ethers'
import { ContractName, getContract } from 'decentraland-transactions'
import { CHAIN_ID } from './constants'
import type { UseCreditsArgs } from './buildUseCreditsArgs'

export async function submitBuy(signer: Signer, args: UseCreditsArgs) {
  const cm = getContract(ContractName.CreditsManager, CHAIN_ID) // Amoy 0x8052…fb3
  const contract = new Contract(cm.address, cm.abi, signer)

  // If maxUncreditedValue > 0 the buyer tops up MANA — ensure MANA is approved to
  // the CreditsManager beforehand (standard ERC20 approve), else the tx reverts.
  const tx = await contract.useCredits(args) // single tuple arg, order per §3
  return tx.wait() // returns receipt; tx.hash is the on-chain hash
}
```

### 5.7 Putting it together (buy handler)

```ts
async function onBuyWithCredits(trade: Trade, signer: Signer, buyer: string, signFetch) {
  // price = ERC20 amount in trade.received (wei)
  const priceAsset = trade.received.find(a => a.assetType === /* ERC20 */ 1)
  const price = priceAsset!.amount!.toString()

  const { credits } = await getUserCredits(buyer, signFetch)
  const spendable = credits.filter(c => c.status !== 'fully_used') // AVAILABLE + PARTIALLY_USED
  if (spendable.length === 0) throw new Error('No credits to spend')

  const args = buildUseCreditsArgs({ trade, buyer, credits: spendable, maxCreditedValue: price })
  const receipt = await submitBuy(signer, args)
  return receipt.transactionHash
}
```

---

## 6. Field-order cheat sheet (do not reorder)

- **UseCreditsArgs:** `credits`, `creditsSignatures`, `externalCall`,
  `customExternalCallSignature`, `maxUncreditedValue`, `maxCreditedValue`.
- **Credit (on-chain):** `value` (uint256, = server `amount`), `expiresAt`
  (uint256 seconds), `salt` (bytes32, = padded server `id`).
- **ExternalCall:** `target`, `selector` (bytes4), `data` (bytes), `expiresAt`
  (uint256), `salt` (bytes32).

---

## 7. Verified source references

- credits-server route + handler: `routes.ts:65` (GET credits, signed-fetch),
  `routes.ts:141-143` (dev-mint), `routes.ts:78-82` (sign-external-call);
  handlers `get-user-credits.ts:18-80`, `dev-mint-credit.ts:24-42`,
  `sign-external-call.ts` + `logic/signer.ts:139-183`; types
  `types/entities.ts:120-146`; balances `adapters/db/db.ts:167-233`; port
  `.env.default:11`.
- ABI: `decentraland-transactions/src/abis/CreditsManager.ts:1582-1623`.
- Solidity: `offchain-marketplace-contract/src/credits/CreditsManagerPolygon.sol`
  (UseCreditsArgs 134-141, Credit 146-150, ExternalCall 159-165, useCredits 396).
- Addresses/enum: `decentraland-transactions/src/contracts/creditsManager.ts:5-18`,
  `src/types.ts:69`, `src/contracts/index.ts:29,60,63-79`.
- Execution reference (dapps): `.../decentraland-dapps/dist/lib/credits.js`
  (prepareCreditsData 15-42, prepareExternalCall 48-61, calculateMaxUncreditedValue
  68-72, executeUseCredits 82-94, prepareCreditsMarketplace 145-179, getTradePrice
  238-245); marketplace app dispatch `webapp/src/modules/order/sagas.ts:146,160-162`;
  beneficiary `webapp/src/utils/trades.ts:118-135`.
