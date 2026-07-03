# Marketplace UX Improvements — Design Spec (INCOMPLETE)

## Status: BLOCKED by Figma MCP rate limit

The Figma MCP tools loaded and authenticated successfully, and the first few
calls returned real data. However, after 3–4 successful calls the server began
returning a **hard rate-limit error** on every subsequent call, including
`get_screenshot` and `get_design_context`:

> "You've reached the Figma MCP tool call limit for your View seat on the
> Professional plan. Upgrade your seat or plan for more tool calls."

This is not a transient throttle — waiting ~60 seconds and retrying produced the
identical error. It is a per-seat/plan cap tied to the **View seat on the
Professional plan**. No screenshots or design-context (colors, typography,
tokens) could be extracted before the cap was exhausted.

To unblock: upgrade the Figma seat/plan for MCP access (link surfaced by the
error), or run the extraction from an account with a higher-tier seat, then
re-run this task.

## File

- fileKey: `Z0actRbZof0tDolIdxIL3A` (Marketplace UX Improvements)

## What was confirmed before the cap hit

The metadata calls that succeeded returned only a partial view of the document.

### Top-level pages (as returned)

| Page node-id | Name |
| --- | --- |
| `9:1866` | `________  OVERVIEW  ________` |

Note: `get_metadata` with no nodeId listed only this single "OVERVIEW" page.
The OVERVIEW canvas itself reported `width=0 height=0` (empty divider/section
page). The Nav Bar node (`696:35050`) lives on a different page that was **not**
included in the returned page list — the page listing appears to be truncated or
the account's seat only surfaces a subset. The remaining pages/frames could not
be enumerated because the cap was hit on the next call.

### Known nodes

| Node id | Type | Name | Size (px) |
| --- | --- | --- | --- |
| `9:1866` | canvas/page | `________  OVERVIEW  ________` | 0 × 0 (empty) |
| `696:35050` | instance | Nav Bar | 1920 × 92 |

The Nav Bar (`696:35050`) is a 1920×92 component instance — i.e. a full-width
desktop top navigation bar, 92px tall, designed against a 1920px canvas width.
Its internal structure (Explore / Shop / Create / Learn links, notifications,
avatar), colors, and typography could **not** be captured because
`get_screenshot` and `get_design_context` were both rate-limited.

## Screens

None saved. `/Users/juanma/Projects/dcl/shop/design/screens/` is empty because no
screenshot call succeeded.

| Screen | node-id | screenshot | description |
| --- | --- | --- | --- |
| _(none captured)_ | — | — | Blocked by rate limit |

## Design tokens

Not captured — `get_design_context` was rate-limited before any token
(color/typography/spacing/radius/shadow) could be read.

## Next steps to complete this spec

1. Restore Figma MCP access (upgrade seat/plan, or use a higher-tier account).
2. `get_metadata` (no nodeId) to enumerate ALL pages — the current listing is
   incomplete; the page holding `696:35050` and the marketplace screens is
   missing from the returned list.
3. Find the page containing `696:35050` and walk its frames to locate:
   home/Explore, Shop/browse grid, item/asset detail, My Assets,
   Sell / list-for-sale, Buy Credits, Cart, Checkout.
4. `get_screenshot` (maxDimension 1600) each, curl the returned URL to
   `screens/<kebab-name>.png`.
5. `get_design_context` on Shop grid, item detail, Sell flow, and Nav Bar
   (`696:35050`) to extract colors, typography, spacing, radii, shadows, and
   component structure.
