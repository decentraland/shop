# Shop — QA test cases

Living checklist for intensive QA of the Shop (credits-only, web2-first marketplace). Grouped by feature;
each case has **preconditions → steps → expected**. Keep adding as we build.

> **Statuses:** ✅ built & mergeable · 🟡 built, behind a pending decision/deploy · ⛔ not built yet.

## Provider matrix (test every purchase/auth flow against all three)

| Provider | Kind | The user is… | Wording they may see |
| --- | --- | --- | --- |
| **MetaMask** (or any injected) | self-custody / web3 | acting in their own wallet | credits; "sign in"; and the **only** relaxation: a generic **"confirm"/"approval"** step |
| **Magic** | managed / web2 (email) | a mass web2 user | credits; "sign in" — **and nothing else crypto**; steps read "instant / a moment" |
| **Thirdweb** | managed / web2 (email/social) | a mass web2 user | same as Magic |

**Global wording rule (all screens):** for Magic/Thirdweb users the words **wallet, MetaMask, sign/signature,
transaction/tx, chain/network, on-chain, gas, approval, contract, MANA, blockchain, mint, token, address**
must **never** appear. Self-custody users may see only "confirm"/"approval". The only currency shown anywhere
is **credits**. (See `CONVENTIONS.md`.)

---

## 1. Cart & checkout — the money path ✅

Precondition for all: signed in; ≥1 buyable (on-sale) item; enough credits unless noted.

| ID | Case | Steps | Expected |
| --- | --- | --- | --- |
| CART-01 | Buy 3-item cart — **MetaMask** | Add 3 on-sale items → Cart → Checkout | Progress reads honest stages **Reserving → Confirm (one approval in the wallet) → Settling**; exactly **one** confirmation prompt for the whole cart (not one per item); success modal (DCL logo + bar) → success page lists all 3. No banned words beyond "confirm/approval". |
| CART-02 | Buy 3-item cart — **Magic** | Same, signed in with Magic | **No** confirmation/approval step shown ("a moment"/"instant"); purchase completes with no crypto wording anywhere; success page lists 3. |
| CART-03 | Buy 3-item cart — **Thirdweb** | Same, signed in with Thirdweb | Same as Magic. |
| CART-04 | Not enough credits | Cart total > balance → Checkout | Buy-credits (no-funds) flow → Stripe top-up → return → purchase auto-resumes and completes. |
| CART-05 | User cancels (self-custody) | MetaMask, reject the confirmation | Friendly "You cancelled the request"; cart intact; no partial purchase. |
| CART-06 | Mixed cart | Primary (mint) + secondary items together | Grouped correctly; single settlement; all delivered. |
| CART-07 | Quantity (primary) | Increase qty on a primary line up to stock | Can't exceed remaining stock; total updates. |
| CART-08 | Empty / remove | Remove last item | Empty-cart state; checkout disabled. |

## 2. Browse — On Sale / All / Not for Sale ✅

| ID | Case | Steps | Expected |
| --- | --- | --- | --- |
| BROWSE-01 | Default view | Open collectibles | Status defaults to **On Sale**; only on-sale items; fast (unified feed). |
| BROWSE-02 | All | Switch status → All | On-sale **and** not-for-sale items. |
| BROWSE-03 | Not for Sale | Switch status → Not for Sale | Only not-for-sale; cards are **view-only** (👁 VIEW button, **no** Add to cart). |
| BROWSE-04 | Filter loading | Change any filter/sort/search | Cards become **skeletons** while fetching; no card "morphs" into another item (stable keys). *(PR #138)* |

## 3. Item detail — Not for Sale (Figma 1182-203305) ✅

Precondition: open an item with no buyable listing.

| ID | Case | Steps | Expected |
| --- | --- | --- | --- |
| PDP-01 | Layout | Open a not-for-sale item | Title + favourite; rarity/category/gender tags; **DESCRIPTION** (if the item has one); Creator + Collection; a divider; then **"Not for Sale" + ⓘ** on the left (no "PRICE" label) and **OUT OF STOCK** on the right only when primary supply is exhausted; Notify-me form; **Make an offer** (disabled). |
| PDP-02 | Not-for-sale tooltip | Hover/focus the ⓘ next to "Not for Sale" | Tooltip: "This item isn't listed for sale right now. Get notified when it becomes available." |
| PDP-03 | Make an offer (coming soon) | Hover/focus **Make an offer** | Button looks disabled and is **not** clickable; tooltip "Coming soon — you'll be able to make an offer on items that aren't for sale."; Segment event **`Shop Make Offer Tooltip Shown`** fires **once** per page view (with contractAddress + itemId). |
| PDP-04 | Similar products | Scroll to "Similar products on sale" | Carousel of on-sale items + View all. *(visual polish deferred)* |

## 4. Notify me when available 🟡

Frontend + capture ✅; the **on-sale trigger that actually sends the email is not wired yet** (transport decision pending) — so NOTIFY-06 can't pass end-to-end until then.

| ID | Case | Steps | Expected |
| --- | --- | --- | --- |
| NOTIFY-01 | Prefill (Magic/Thirdweb) | Signed in with Magic/Thirdweb, open a not-for-sale item | Email field **prefilled** from the account email, still editable. |
| NOTIFY-02 | Self-custody | Signed in with MetaMask | Field empty + editable (no email on file). Enter a valid email. |
| NOTIFY-03 | Submit | Enter valid email → NOTIFY ME | Success state "You're on the list / We'll let you know when it's available." |
| NOTIFY-04 | Guest | Signed out | No email field — a single "Sign in to get notified" CTA. |
| NOTIFY-05 | Already subscribed | Re-open an item you subscribed to | Subscribed/confirmed state on load (no empty form). |
| NOTIFY-06 | Invalid email | Type "abc" | NOTIFY ME disabled until a valid-looking email. |
| NOTIFY-07 | **End-to-end** ⛔ | Subscribe to item X → item X is put on sale | Subscriber receives the availability email with a working link to the item. *(blocked on the on-sale trigger)* |
| NOTIFY-08 | Unsubscribe | Use the unsubscribe link / DELETE flow | Status → unsubscribed; no further emails. |
| NOTIFY-09 | Email safety | Item name contains HTML (e.g. `</strong><img onerror=...>`) | Email renders the name escaped; no markup/script injected. |

## 5. Filters ✅

| ID | Case | Steps | Expected |
| --- | --- | --- | --- |
| FILTER-01 | Smart tooltip | Hover/focus the ⓘ next to the **SMART** toggle | Real (styled) tooltip: "Smart wearables add interactive, in-world utility." |
| FILTER-02 | Category / rarity / gender / price / sort | Apply each | Grid updates; URL reflects the filter; skeletons during fetch (see BROWSE-04). |
| FILTER-03 | Mobile | Narrow viewport | Sort/Filters pills; filter icon present; smart hierarchy correct. |

## 6. Cross-cutting — web2/web3 wording ⛔ (manual audit)

| ID | Case | Steps | Expected |
| --- | --- | --- | --- |
| COPY-01 | Web2 audit | As a **Magic/Thirdweb** user, walk every screen (browse, PDP, cart, checkout, success, errors, empty states, notify) | **Zero** banned words (wallet, MetaMask, sign/signature, transaction, chain, gas, on-chain, approval, contract, MANA, blockchain, mint, token, address). Only "credits" + "sign in". |
| COPY-02 | Self-custody audit | As a **MetaMask** user, same walk | Only relaxation allowed is "confirm"/"approval". Everything else still banned. |

---

## Open items feeding this doc
- **Notify on-sale trigger** (NOTIFY-07): decided approach = marketplace-server POSTs shop-server on trade
  creation (event-driven, not polling). Until wired, the waitlist captures demand but sends nothing.
- **Make an offer** (PDP-03): disabled on purpose; bids are a future contracts epic. The tooltip event
  feeds a "who wants bids" chart (TODO: build the dashboard).
