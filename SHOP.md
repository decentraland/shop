# The Shop

> Working document. The "How it works" section is written for anyone — Marketing included — and
> assumes no technical background. Everything below it gets progressively more detailed.
>
> **Status: draft.** Sections marked _TODO_ still need input from their owner.

---

## 1. How it works, in plain terms

The Shop is where people buy Decentraland wearables and emotes **with a card**, without needing to know
anything about crypto.

The flow a buyer sees:

1. They buy **credits** with a credit card — like buying coins in a mobile game.
2. They spend those credits on wearables and emotes.
3. The item lands in their inventory.

That is the whole experience. No wallet setup, no tokens, no gas, no exchange.

### What credits are

A credit is worth a **fixed 10 US cents**. Always. 100 credits = $10.

That fixed price is the point. Prices in the Shop do not move when crypto markets move, so a wearable
that costs 50 credits today costs 50 credits next month. A buyer can reason about what things cost.

Credits are bought in packs. Each pack charges slightly more than the credits are worth — see
[Pricing](#4-pricing-for-discussion) below for the numbers and the reasoning.

Credits **never expire**, and they can only be spent inside the Shop — they cannot be cashed out or
transferred to another person.

### What creators get

When a creator sells an item they made, they are paid in **MANA**, directly, to their wallet. MANA is a
normal cryptocurrency, so a creator can move it to an exchange and convert it to money if they want to.

Creators are paid in MANA specifically so they can do that. Credits cannot leave the Shop; MANA can.

### What the Shop does NOT do

- **It does not sell second-hand items.** You cannot buy someone's used wearable in the Shop, and you
  cannot put your own up for sale there. The older Marketplace still does both.
- **It does not let you cash out credits.** Credits go in one direction: money → credits → items.

### Where the Shop ends and the Marketplace begins

They are two different products against the same catalogue.

| | **Shop** | **Marketplace** (the older one) |
|---|---|---|
| Pay with | credit card (credits) | MANA |
| Prices | fixed in dollars | move with the MANA price |
| Buy new items from creators | yes | yes |
| Buy second-hand items | **no** | yes |
| Sell your own items | **no** | yes |
| Needs a crypto wallet | no | yes |

_TODO (Marketing): how we want to name and position these two publicly._

---

## 2. Feature flags

Every significant behaviour is behind a flag, so it can be turned on or off **without a deploy**.

### How to read a flag name

Flags live in the Decentraland feature-flag service, grouped by *application*. The full name is
`<application>-<feature>`:

- `dapps-…` — read by the Shop web app and by credits-server on its behalf
- `core-…` — read by credits-server for money-path decisions

Each environment has its own file: `.zone` for dev and staging, `.org` for production. **A flag that
does not exist reads as OFF** — every reader in this codebase fails closed on purpose, so an absent or
unreachable flag never accidentally enables something.

### The flags

| Flag | What it enables | Live now |
|---|---|---|
| `dapps-credits-server` | The credits system at all. Off = no credits anywhere. | ON |
| `core-shop-usd-credits` | Dollar-denominated credits (the fixed 10¢ model). | ON |
| `core-stripe-payments` | Buying credits with a card. Off = the "get credits" flow is closed, existing balances still spend. | ON |
| `dapps-iap-credits` | Buying credits through the mobile app stores (in-app purchase). | ON |
| `dapps-shop-secondary-sales` | Second-hand sales in the Shop: buying a listed item and putting your own up for sale. | **absent → OFF** |
| `dapps-proceeds-to-treasury` | Paying a second-hand seller in credits instead of MANA. Only has any effect when the flag above is on. | **OFF** |
| `dapps-credits-blacklisted-domains` | Blocks credits from being spent on specific domains. | ON |
| `dapps-unflaggable-credits-addresses` | Exempts specific wallets from automated fraud flagging. | ON |
| `dapps-credits-server-scene-ignore-list` | Scenes excluded from credits rewards. | ON |

### The two that matter right now

**`dapps-shop-secondary-sales` — OFF, and deliberately not created.**

This is what makes the Shop primary-only. With it off, the browse grid asks the server for mint listings
only, the resale surfaces on an item page are not fetched, and the Sell action is hidden.

It does **not** exist in the flag service, and that is intentional: absent reads as off, so the safe
state needs no configuration. Creating it (disabled) would only be to make turning resales back on
possible later.

One thing it does not do: it hides the Shop's surfaces but does **not** retract listings that already
exist. Those remain valid and can still be filled through the older Marketplace. Removing them is a
per-listing cancellation, not a flag.

**`dapps-proceeds-to-treasury` — OFF** (turned off 2026-07-28).

When on, a second-hand sale sends the buyer's MANA to a platform treasury and credits the seller in Shop
credits instead. It is off, and with secondary sales hidden it has no sales to act on either way.

Turning it on is a two-sided decision — the backend consumer must be running and armed first, or MANA
accumulates in the treasury with nobody crediting the sellers. Do not flip it in isolation.

_TODO: link the runbook for arming that flow, if it is ever revisited._

---

## 3. Secondary sales: the decision and its impact

The Shop does not sell second-hand items. That was a deliberate call, and the concern raised against it
was a fair one: creators earn a **2.5% royalty on every resale**, so removing resales could cut a
recurring income stream — which runs against the "creators making a living" goal.

We checked it against real data before committing. **It does not hold.**

### What the numbers say

Source: `DCL.MARKETPLACE.FCT_MARKETPLACE_SALES` (Snowflake, via Metabase). Wearables, smart wearables and
emotes only — LAND and names excluded. These are **marketplace-wide** figures (the legacy Marketplace plus
the Shop), so they are the upper bound on what removing Shop resales could cost.

| Month | Primary sales | Primary volume | Secondary sales | Secondary volume | **Royalties to creators** | DAO fee |
|---|---|---|---|---|---|---|
| 2026-04 | 1,985 | $5,078 | 946 | $1,148 | **$25.62** | $23.90 |
| 2026-05 | 1,672 | $3,860 | 575 | $934 | **$21.87** | $20.54 |
| **2026-06** | 654 | $1,402 | 650 | $1,106 | **$25.83** | $23.87 |
| 2026-07 (partial) | 954 | $1,570 | 416 | $1,277 | **$16.70** | $16.25 |

Those royalty figures are the **actual amounts recorded on-chain** (`ROYALTIES_CUT_USD`), not 2.5% applied
by hand.

### What that means

Take June, the last full month:

- Creators earned about **$1,367** from primary sales (volume minus the DAO fee).
- Creators earned **$25.83** from secondary royalties — across **every creator, combined**.

**Secondary royalties are 1.9% of creator income.**

The percentage understates how small this is. The stronger point is the absolute number: **the entire
royalty pool is roughly $26 a month.** Even if a single creator received all of it, it would be $26.
Nobody can be materially dependent on this, which is why a per-creator breakdown was not needed to answer
the question.

### And no catalogue is lost today

All **210 items** currently listed in the Shop are primary. Hiding resales removes nothing from what a
buyer can see right now.

### What it does cost

Honesty about the downside:

- **The cost is prospective, not immediate.** As collections sell out, those items would have become
  resale-only. They now become unpurchasable in the Shop entirely. That gap grows over time.
- **The scarce end thins out.** Across the wider marketplace catalogue, most mythic, exotic and unique
  stock exists only as resales (for `unique`, roughly 85%). A primary-only Shop serves the casual buyer
  well and the collector poorly.
- **Reversible.** It is a feature flag, not a deletion. See §2.

### The bigger number nobody should miss

Primary volume went from **$5,078 in April to $1,402 in June** — a 72% fall in two months. Secondary held
flat around $1,000.

Whatever we decide about resales moves a $26 line item. The contraction in primary sales is two orders of
magnitude more important to "creators making a living", and the Shop's job is to reverse it.

_TODO: confirm whether the July drop is seasonal or a trend — one partial month is not enough to say._

---

## 4. Pricing (for discussion)

> **Not decided.** These are the numbers currently in the code. This section exists so everyone can
> comment and we can settle on them. Comment inline.

### What is in the code today

| Pack | Charged | Credits granted | Spend value | Wedge |
|---|---|---|---|---|
| Small | $4.99 | 45 | $4.50 | $0.49 (9.8%) |
| Medium | $9.99 | 90 | $9.00 | $0.99 (9.9%) |
| Large | $24.99 | 235 | $23.50 | $1.49 (6.0%) |
| Extra large | $49.99 | 475 | $47.50 | $2.49 (5.0%) |

### Why the wedge exists

A credit is pegged at 10¢ of **spend** value. But charging exactly $4.50 for 45 credits would lose money
on every sale, because the card processor takes a cut before the money reaches us.

So the charge and the grant are deliberately different numbers: **you are charged $4.99 and receive
$4.50 of spending power.** The difference covers the card fee. It is not a markup on the items — item
prices are unaffected.

This is why the code calls it *break-even pricing*, and why the two values must never be derived from
each other. A well-meaning "fix" that sets credits to `charge × 10` would silently make every card sale
lose money.

### Does the wedge actually cover the fee?

At standard card pricing (2.9% + 30¢):

| Pack | Wedge | Card fee | Net |
|---|---|---|---|
| Small | $0.49 | $0.44 | **+$0.05** |
| Medium | $0.99 | $0.59 | +$0.40 |
| Large | $1.49 | $1.02 | +$0.47 |
| Extra large | $2.49 | $1.75 | +$0.74 |

**The small pack is the one to look at.** It clears the fee by 5 cents. That is inside the noise: a
non-standard card, an international card, a currency conversion or a single dispute turns it negative.

Things worth deciding:

- **Is the small pack meant to break even, or is it a loss-leader?** Either is defensible, but it should
  be a choice rather than an artefact of rounding.
- **The fixed 30¢ per transaction is what squeezes the small pack.** Raising it to $5.49, or granting 40
  credits instead of 45, both fix it — with different messages to the buyer.
- **The wedge is regressive** (9.8% on the small pack, 5.0% on the largest). That is normal for pack
  pricing and rewards bigger purchases, but it is a pricing stance we should hold on purpose.
- **We have not modelled disputes or refunds.** A single chargeback on a $4.99 pack costs far more than
  the 5 cents that pack earned.
- **What do real fees look like?** The table above assumes standard rates. _TODO (finance): confirm the
  actual blended rate and whether international cards are a material share._

### Where the numbers live

The authoritative catalogue is `credits-server` (`src/logic/credit-pack-catalog.ts`) — checkout is always
priced by the server from a pack id. The Shop keeps a copy for rendering only, so a drift affects display
but never what is charged.

_TODO: agree the numbers, then update both._

---

## 5. The pieces

| Service | What it owns |
|---|---|
| **shop** | The web app. Browsing, cart, checkout, the buyer's and creator's screens. |
| **credits-server** | Credit balances, card checkout (Stripe), in-app purchases, refunds. The ledger. |
| **shop-server** | The treasury: holds funds and keeps the on-chain credits contract funded so purchases can settle. |
| **marketplace-server** | The catalogue. Both the Shop and the Marketplace read items from it. |
| **marketplace-squid** / **trades-squid** | Index the blockchain so the catalogue and sales history exist. |

_TODO: a diagram of the money path (card → credits → item → creator)._

---

## 6. Money, precisely

Aimed at engineers and finance.

- Credits are stored in **cents**, integers. A balance is never a floating-point number.
- Prices are **rounded up** to the nearest whole credit when charging; balances are **rounded down**
  when displayed. A buyer is never shown a credit they cannot spend.
- Card purchases are the only way credits are created against money the buyer themselves paid.
- Creators are paid in MANA on-chain, by the marketplace contract, not by us.
- On a **primary** sale the contract takes **2.5%** and it goes to the **DAO**. Measured: creator royalties
  were $0 across all four months above.
- On a **second-hand** sale the split depends on which contract settles it, and both regimes are live. Of
  650 secondary sales in June: **428** paid *both* a 2.5% creator royalty **and** a 2.5% DAO fee (5% total,
  the legacy path), and **213** paid only the 2.5% royalty (the off-chain trade path the Shop uses).
- That was measured rather than read off the contract. Reading `feeRate` and `royaltiesRate` suggests the
  two are mutually exclusive; the data shows they are not. Configuration values do not tell you the
  execution path.

_TODO (finance): reconciliation and reporting ownership._

---

## 7. Environments

| | URL | Chain |
|---|---|---|
| dev | `decentraland.zone` | Polygon Amoy (testnet) |
| staging | `decentraland.today` | Polygon Amoy (testnet) |
| production | `decentraland.org` | Polygon mainnet |

Dev and staging use test money end to end: test cards, testnet MANA. Nothing there is real.

---

## Open questions

- Naming and positioning of Shop vs Marketplace (Marketing)
- Whether credits will ever be cashable out — this changes the model materially and needs sign-off
  before any work starts
- Reconciliation and reporting ownership (finance)
