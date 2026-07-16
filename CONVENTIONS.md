# Shop — conventions

## Web2-first: NO web3/blockchain terms in the UI

The Shop targets mass **web2** users. All blockchain happens behind the scenes. **Never** surface crypto jargon in any user-facing copy (buttons, labels, statuses, errors, tooltips, empty states).

**Banned words in UI:** wallet, MetaMask, sign / signature, chain / network, on-chain, gas, transaction / tx, approval, contract, MANA, blockchain, mint, token, address (as "wallet address").

**Use instead:**

| Instead of… | Say… |
| --- | --- |
| Connect wallet / MetaMask | Sign in |
| Disconnect | Sign out |
| Sign the listing / confirm in your wallet | Listing your item… / Confirm to list |
| Settled in MANA / on-chain | (nothing) or "Buyers pay in credits" |
| Switch your wallet to Amoy | (never shown — handle silently) |
| Raw web3 error | "Couldn't list your item — please try again" / "You cancelled the request" |
| MANA / token | credits |
| wallet address | account |

The only currency users ever see is **credits**. MANA, chains, signatures, approvals, and RPCs are internal implementation details.

## Technical note: listings are chain-agnostic

Creating a listing is an off-chain EIP-712 signature — the target chain lives in the trade's salt, not the wallet's current network. **Do not gate listing on the wallet's chain.** Read contract state (signature indices, approval) via a dedicated Amoy RPC, not the wallet provider. Only real transactions (e.g. `setApprovalForAll`) need the right chain — switch just-in-time, silently.
