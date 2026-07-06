# Fitting Room — spec

Try the cart on before buying. Opens a preview with all cart wearables equipped on one avatar and lets
the shopper toggle each item in/out to compare combinations. A conversion lever: seeing the look
together (and spotting what clashes) reduces "will this go with my avatar?" hesitation.

## Behaviour

- Entry points: **Try on** in the cart popover, **Try on outfit** on the Cart page (shown only when
  the cart has at least one wearable).
- The preview mounts the cart's wearables on the connected user's avatar (falls back to the default
  body when they have no published avatar — mirrors `ItemPreview`).
- Each cart item is a row with a toggle. Turning an item on/off updates the avatar live.
- **One item per slot.** An avatar wears at most one wearable per slot (its sub-category: hat,
  upper_body, eyewear, …). Two cart items in the same slot can't be worn together, so turning one on
  **auto-swaps** the other off. Same-slot items are flagged "shares a slot" so the swap isn't
  surprising.
- **Emotes** aren't worn — they're listed but their toggle is disabled.
- Rows can be removed from the cart in place. Footer shows the total + Checkout (→ Cart page).

## Implementation

- `lib/urn.ts` — `itemUrn(item)`: collections-v2 wearable URN (shared with the Success page, which
  used a private copy before). Null when there's no `itemId` (secondary/token listings).
- `lib/outfit.ts` — pure, fully unit-tested: `isWearable`, `slotOf` (sub-category; per-item fallback
  for unknown; null for emotes), `defaultWorn` (one per slot, first wins), `toggleWorn` (swap-aware),
  `conflictingIds`, `wornUrns`.
- `components/FittingRoom.tsx` — the modal; equipped set in local state, seeded from `defaultWorn` on
  open, pruned when items leave the cart. `urns` → `WearablePreview` (lazy iframe, keyed on the outfit
  signature so it always reflects the equipped set). Mounted once at the app shell; `cart` store holds
  `fittingOpen`/`setFittingOpen`.

## Tracking

- `Shop Tried On Outfit` — fired once per open, with `cart_size`, `wearables`, `emotes`,
  `cart_value_credits`.

## Later

- Body-shape (M/F) switch to preview fit on both bodies.
- Play emotes in the room (separate preview mode).
- "Add matching" suggestions for empty slots.
- Persist a favourite outfit / share a look.
