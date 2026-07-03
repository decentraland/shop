# The Shop

A simpler storefront for Decentraland wearables and emotes: prices are shown in **fixed-USD credits**
(1 credit = $0.10), and buyers pay with credits. The blockchain plumbing (MANA, signatures, gas) is
hidden — the experience reads like any web shop.

Under the hood, credits are backed by USD and settle in MANA at spend time (convert-at-spend), so
creators and sellers keep the existing on-chain marketplace guarantees.

## Structure

| Path | What it is |
|------|------------|
| `app/` | The storefront — Vite + React + TypeScript. Browse, buy with credits, sell, import listings. |
| `server/` | The treasury service (@well-known-components) — keeps the credits pool funded (USDC → MANA refill + reconciliation). |
| `tools/migrate-listings/` | CLI that converts a seller's classic MANA-priced listings into credit-priced ones. |
| `design/` | Specs and design docs (credits model, buy/sell integration, Stripe, gasless, e2e, etc.). |
| `VISION.md`, `ROADMAP.md`, `CONVENTIONS.md` | Product vision, roadmap, and code conventions. |

## Getting started (app)

```
cd app
npm install
cp .env.example .env   # adjust if needed; sensible local defaults are built in
npm run dev
```

Then open the printed local URL.

## Testing

```
cd app
npm test          # unit tests (vitest)
npm run test:e2e  # end-to-end happy paths (headless browser, wallet + network mocked)
```

The e2e suite drives the real app with the wallet and all network mocked — no real login, no real
servers, no on-chain transactions. See `design/E2E_TESTS.md` for how it works.

## Configuration

Every service reads its config from environment variables; each package ships a `.env.example`
documenting them. Never commit real secrets — only the `.env.example` templates are tracked.
