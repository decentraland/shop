# The Shop — Gasless Checkout (Meta-Transaction) — SPEC

> **Status: DESIGN + SCAFFOLD.** Goal: the buyer signs **only an off-chain message** (no
> on-chain transaction, no gas), and a **relayer** submits `useCredits` on their behalf and
> pays the gas. Normal buyer-submitted checkout stays the default; gasless is behind a flag.
>
> Companion docs: `CREDITS_CANONICAL_MODEL.md` (credits model), `BUY_WITH_CREDITS_SPEC.md`
> (the `useCredits` args), `SHOP_SERVER_SPEC.md` (treasury). Code scaffold:
> `../app/src/lib/buy-gasless.ts`, `../app/src/lib/gasless-config.ts`, and the relayer stub
> `../server/src/controllers/handlers/relay-meta-tx-handler.ts` (+ route note in
> `GASLESS_INTEGRATION.md`).

---

## 0. META-TX SUPPORT VERDICT (read this first)

**YES — gasless is fully supported by the already-deployed contract, with existing relayer
infra. No new contract, no upgrade, no forwarder needed.**

The `CreditsManagerPolygon` deployed on Amoy at
`0x8052a560e6e6ac86eeb7e711a4497f639b322fb3` (chainId 80002) exposes the **native
Decentraland / Polygon (Biconomy-style) meta-transaction** entrypoint. Verified directly
from the ABI shipped in the shop app's `node_modules`
(`decentraland-transactions/cjs/abis/CreditsManager.js`):

| ABI member | Signature | Role |
|---|---|---|
| `executeMetaTransaction` | `executeMetaTransaction(address _userAddress, bytes _functionData, bytes _signature) payable returns (bytes)` | **the meta-tx entrypoint** — a third party (relayer) submits this; the contract recovers `_userAddress` from `_signature` over `_functionData` and executes as if `_userAddress` called it |
| `getNonce` | `getNonce(address _signer) view returns (uint256)` | per-signer replay nonce |
| `MetaTransactionExecuted` (event) | `(address _userAddress, address _relayerAddress, bytes _functionData)` | emitted on success — the relayer address is recorded on-chain |
| `MetaTransactionFailedWithoutReason` (error) | — | bubbles inner-call reverts |

This is the **"offchain" variant** of the DCL meta-tx (`_functionData`, EIP-712 primary type
`MetaTransaction` with fields `nonce, from, functionData`), selector `0xd8ed1acc`. It is
exactly the pattern `decentraland-transactions`' `sendMetaTransaction()` already builds for,
and the same one MANA / collections / the marketplace use in production.

**How a third party submits `useCredits` on the buyer's behalf:**

1. Buyer builds the `useCredits(UseCreditsArgs)` **calldata** (`functionData`) client-side —
   identical bytes to today's direct call (see `BUY_WITH_CREDITS_SPEC.md §3`).
2. Buyer signs an **EIP-712 `MetaTransaction`** message `{ nonce, from, functionData }` over
   the CreditsManager domain (`eth_signTypedData_v4`). **This is the only thing the buyer
   signs — it is an off-chain signature, costs no gas, sends no transaction.**
3. Relayer calls `executeMetaTransaction(buyer, functionData, signature)` from the relayer's
   own wallet, **paying the gas**. Inside the contract `_msgSender()` resolves to `buyer`, so
   every credit/authorization check that today keys off `msg.sender == buyer` still passes.

**Relayer infra already exists.** The team runs an **OpenZeppelin Relayer** deployment
(`/Users/juanma/Projects/dcl/openzeppelin-relayer-deployment`) fronted by
`transactions-server` (public API `https://transactions-api.decentraland.zone/v1` for
Amoy/dev). The dev relayer is configured for **`polygon-amoy` chain 80002** with an AWS-KMS
signer (`alias/openzeppelin-relayer-signer-dev`) — the exact chain the Shop targets. So the
default gasless backend is **"reuse the existing DCL transactions-server relayer"**; we do not
have to stand up our own. (An optional Shop-owned relayer stub is scaffolded for teams that
want an isolated relayer / custom policy — see §5.)

> One caveat, not a blocker: `useCredits` for **self-owned credits** validates the credit
> signature and the buyer identity; it does **not** require `msg.sender` to pay MANA (the
> CreditsManager already custodies the MANA — see `SHOP_SERVER_SPEC.md`). So relaying changes
> *who submits and pays gas*, not *who the buyer is* or *where the MANA comes from*. Semantics
> are preserved.

---

## 1. What changes vs. today (one line)

**Today:** buyer signs **and submits** `CreditsManager.useCredits(args)` → buyer pays gas.
**Gasless:** buyer signs an **EIP-712 `MetaTransaction` wrapping the same `useCredits`
calldata**; relayer submits `executeMetaTransaction` → **relayer pays gas**.

The `useCredits` args are byte-for-byte identical. The ephemeral-credit `authorize` step,
the settlement/reconciliation, and the USD debit are **all unchanged**.

---

## 2. Exact payload the buyer signs (EIP-712)

Domain (from `getContract(ContractName.CreditsManager, 80002)`):

```jsonc
{
  "name": "Decentraland Credits",
  "version": "1.0.0",
  "verifyingContract": "0x8052a560e6e6ac86eeb7e711a4497f639b322fb3",
  "salt": "0x000...0013882"   // bytes32(chainId) — chainId 80002 = 0x13882, left-padded to 32 bytes
}
```

Types + message (the **offchain** variant — CreditsManager uses `_functionData`):

```jsonc
// types
"EIP712Domain":    [ {name:"name",type:"string"}, {name:"version",type:"string"},
                     {name:"verifyingContract",type:"address"}, {name:"salt",type:"bytes32"} ],
"MetaTransaction": [ {name:"nonce",type:"uint256"}, {name:"from",type:"address"},
                     {name:"functionData",type:"bytes"} ],
// primaryType: "MetaTransaction"
// message
{
  "nonce":        <getNonce(buyer)>,                       // uint256, read from the contract
  "from":         "<buyer address>",
  "functionData": "0x<useCredits(UseCreditsArgs) calldata>" // = iface.encodeFunctionData('useCredits',[args])
}
```

- `functionData` is the **full `useCredits` calldata** (selector `+` ABI-encoded
  `UseCreditsArgs`), exactly what `buy.ts` would have submitted as a direct tx.
- The buyer produces the signature with `eth_signTypedData_v4` (or ethers
  `_signTypedData(domain, types, message)`). **No `eth_sendTransaction`, no gas prompt.**

> We deliberately build this ourselves in `buy-gasless.ts` rather than call
> `decentraland-transactions`' `sendMetaTransaction()` directly, because that helper reads the
> account from an injected EIP-1193 provider and hard-codes the transactions-server URL. Our
> scaffold uses the **same algorithm** (same types, same domain, same nonce read, same
> `executeMetaTransaction` calldata packing) but takes an explicit `signer` + configurable
> relayer URL, and stays feature-flaggable. If you prefer zero custom crypto, you can swap our
> `signAndRelay` internals for `sendMetaTransaction(provider, provider, functionData,
> creditsManagerContractData, { serverURL })` — the on-chain result is identical.

---

## 3. Relayer endpoint contract (request / response)

We target the **DCL `transactions-server`** shape (what the OZ relayer sits behind), so we can
use the shared infra with no server work. Endpoint:

```
POST {RELAYER_URL}/transactions        // e.g. https://transactions-api.decentraland.zone/v1/transactions
Content-Type: application/json
```

Request body:

```jsonc
{
  "transactionData": {
    "from":   "<buyer address>",                       // the meta-tx signer (buyer)
    "params": [
      "0x8052a560e6e6ac86eeb7e711a4497f639b322fb3",    // CreditsManager address (the `to`)
      "0x<executeMetaTransaction(buyer, functionData, signature) calldata>"  // the relayed call
    ]
  }
}
```

- `params[0]` = target contract (CreditsManager). `params[1]` = the ABI-encoded
  `executeMetaTransaction(_userAddress, _functionData, _signature)` calldata (built by
  `getOffchainExecuteMetaTransactionData` / `iface.encodeFunctionData`). The relayer wraps
  this in a real transaction from its KMS wallet and broadcasts it.

Success response:

```jsonc
{ "ok": true, "txHash": "0x…" }
```

Error response (transactions-server convention):

```jsonc
{ "ok": false, "message": "…human message…", "code": <ErrorCode> }
```

The Shop-owned relayer stub (§5) mirrors this exact contract so the frontend code path is
identical whether pointed at DCL's relayer or ours.

---

## 4. End-to-end gasless flow (composes with ephemeral credits)

```
Buyer clicks "Buy" ($ price)
  │
  ├─(1) credits-server  POST /credits/authorize { tradeId, usdPriceCents }
  │        → checks USD balance, reads oracle, signs EPHEMERAL credit {value,expiresAt,salt},
  │          writes PENDING intent (reserves the $).           [UNCHANGED from today]
  │        ← { credit, signature, maxCreditedValue }
  │
  ├─(2) client builds useCredits(UseCreditsArgs) calldata      [same builder as buy.ts]
  │        (accept([trade]) external call + the ephemeral credit)
  │
  ├─(3) client reads getNonce(buyer) from CreditsManager (read-only RPC)
  │
  ├─(4) BUYER SIGNS EIP-712 MetaTransaction{nonce,from,functionData=calldata}   ← ONLY signature, no gas
  │
  ├─(5) client packs executeMetaTransaction(buyer, functionData, sig) calldata
  │        POST {RELAYER_URL}/transactions { transactionData:{ from:buyer, params:[CM, data] } }
  │        ← { ok:true, txHash }                                RELAYER PAYS GAS
  │
  ├─(6) client POLLS settlement:
  │        - option A (chain): wait for txHash receipt via read-only RPC (status===1)
  │        - option B (books): poll credits-server GET /users/:addr/purchases until the
  │          matching intent (by salt/tradeId) flips PENDING → SETTLED (indexer + reconciler)
  │        We do (A) for immediate UX confirmation, then invalidate the balance query so (B)'s
  │        SETTLED debit shows once indexed. On-chain: contract pulls MANA, mints/transfers NFT,
  │        emits CreditUsed(salt) → squid → intent SETTLED → $ debited exactly.  [UNCHANGED]
  │
  └─ on ANY failure before a broadcast txHash: cancelUsdIntents([salt]) to release the reserved $.
```

**Who pays gas:** the relayer's wallet (KMS-backed on Amoy dev). The buyer pays **nothing**
on-chain — no POL, no MANA for gas, no approval tx. (For self-owned USD credits there is also
no ERC-20 approval needed; the CreditsManager holds the MANA.)

---

## 5. Replay / nonce / safety

- **Nonce:** the CreditsManager tracks a per-signer nonce (`getNonce(buyer)`). The EIP-712
  message includes it; the contract rejects a reused nonce → **the signed meta-tx cannot be
  replayed**. The client always reads a fresh nonce right before signing.
- **Domain binding:** the `salt = bytes32(chainId)` in the domain binds the signature to
  chain 80002; a signature can't be replayed on another chain.
- **Credit single-use:** the ephemeral credit's `salt` is single-use on-chain (CreditsManager
  marks it spent) and the intent is PENDING→SETTLED once; a second submission of the same
  `functionData` reverts on the credit, independent of the meta-tx nonce.
- **Expiry:** ephemeral credit TTL (~2 min) and `externalCall.expiresAt` (now+24h) both bound
  the window; a stale signed meta-tx that arrives after the credit expired just reverts (funds
  auto-released at intent TTL).
- **Relayer trust:** the relayer can *choose whether* to submit and *when*, but **cannot alter
  what** is executed — the buyer's signature covers the full `functionData`. Worst case a
  malicious/broken relayer drops the tx → no settlement → the client releases the reservation.
- **Contract-account guard:** meta-tx signing requires an EOA (or EIP-7702-delegated EOA);
  smart-contract wallets that can't produce an EIP-712 personal signature fall back to normal
  checkout. `buy-gasless.ts` surfaces this so the caller can fall back.

---

## 6. Feature flag + fallback

- Flag: `VITE_GASLESS_CHECKOUT` (`'1'`/`'true'` = on). Default **off** → normal
  buyer-submitted `buy.ts` path, unchanged.
- Relayer URL: `VITE_RELAYER_URL` (default `https://transactions-api.decentraland.zone/v1`).
- The page picks the path at call time:

  ```ts
  const hash = gaslessEnabled()
    ? await buyGasless({ trade, buyer, signer, credits:[credit], maxCreditedValue })
    : await buyWithCredits({ trade, buyer, signer, credits:[credit], maxCreditedValue })
  ```

- **Automatic fallback:** `buyGasless` throws a typed `GaslessUnavailableError` when the flag
  is off, the signer is a contract account, or the relayer is unreachable/returns `ok:false`
  with a retryable code. The caller catches it and retries via `buyWithCredits` (buyer submits,
  pays gas) so a relayer outage never blocks a sale. This keeps normal checkout the safety net.
- Batch (`buyManyGasless`) mirrors `buyManyWithCredits`: one signed meta-tx per
  (chain, marketplace) group; each group is one `useCredits(accept([...]))`.

---

## 7. UI copy (web2-first)

Gasless removes the wallet gas prompt, so the checkout copy gets *simpler*, never more
technical. Allowed: "Confirm your purchase", "Approve in your wallet" → replace with
**"Confirming your order…"**, **"Purchased! 🎉"**, prices in **"$" / "credits"** only. Never
surface: gas, relayer, meta-transaction, nonce, chain, MANA, on-chain, signature. The one
approval the buyer still does (the off-chain signature) is presented as **"Confirm"** with no
mention of signing or gas. Backend/spec technical terms (this doc, server logs) are fine.

---

## 8. Verified source references

- Meta-tx ABI: `shop/app/node_modules/decentraland-transactions/cjs/abis/CreditsManager.js`
  (`executeMetaTransaction`, `getNonce`, `MetaTransactionExecuted`,
  `MetaTransactionFailedWithoutReason`).
- EIP-712 build algorithm: `…/decentraland-transactions/cjs/sendMetaTransaction.js`
  (`getDataToSign`, `getDomainData`), `…/cjs/utils.js`
  (`getNonce` selector `0x2d0335ab`, `getOffchainExecuteMetaTransactionData` selector
  `0xd8ed1acc`, `getSalt`), `…/cjs/types.js` (`DOMAIN_TYPE`, `OFFCHAIN_META_TRANSACTION_TYPE`),
  `…/cjs/configuration.js` (default `serverURL`).
- Domain values: `…/cjs/contracts/creditsManager.js` (name `Decentraland Credits`, version
  `1.0.0`, Amoy address, chainId).
- `useCredits` args + calldata: `BUY_WITH_CREDITS_SPEC.md §3`, `shop/app/src/lib/buy.ts`.
- Relayer infra: `/Users/juanma/Projects/dcl/openzeppelin-relayer-deployment` (README +
  `config/dev/config.json`: `polygon-amoy` chain 80002, KMS signer, RPC
  `rpc.decentraland.org/amoy`).
