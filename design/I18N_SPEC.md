# i18n — spec & conventions

The Shop is localized with **react-intl** (no redux — unlike the marketplace's decentraland-dapps
setup, which needs a store). English + Spanish to start.

## How it works

- `src/intl/en.json` / `es.json` — nested message catalogs (authored nested for readability, flattened
  to dot keys at load).
- `src/intl/i18n.ts` — exposes a plain **`t('a.b.c', { var })`** (like the marketplace) on top of
  react-intl. `t()` reads a module-level "active" intl that `<I18nProvider>` keeps in sync with the
  locale. It also works **without** a provider (defaults to English) — so unit tests that assert
  English strings stay green without wrapping in a provider.
- `src/intl/I18nProvider.tsx` — wraps the app; `key={locale}` remounts the tree on a language switch
  so every `t()` re-evaluates (locale changes are rare → a remount is fine and keeps the API simple).
- `src/store/locale.ts` — Zustand locale store; initial locale = `?lang=` → saved → browser → `en`.
- `src/components/LanguageSwitcher.tsx` — the sub-nav picker.

## Conventions for converting a file (the fan-out)

1. `import { t } from '~/intl/i18n'`.
2. Replace every **user-facing** string (JSX text, button/link labels, `placeholder`, `aria-label`,
   `title`/`alt`, `setStatus`/`setError` strings, and `throw new Error('…')` messages shown via a
   `friendlyError`) with `t('<namespace>.<key>')`.
3. **Namespace by file/area**: `cart.*`, `itemDetail.*`, `fittingRoom.*`, `getCredits.*`, `sell.*`,
   `market.*`, `overview.*`, `assets.*`, `myAssets.*`, `success.*`, `common.*` for shared.
4. **Interpolation** for dynamic bits: `t('cart.total', { count })` with `"Total {count}"`. Do NOT
   concatenate translated fragments.
5. **Keep the English value byte-identical** to the current hardcoded string, so existing unit/e2e
   assertions (which check English) keep passing.
6. Add the key to **both** `en.json` and `es.json` (Spanish translated; Rioplatense "vos" register,
   consistent with the existing nav strings).
7. Do **not** translate: internal ids, query keys, config keys, analytics event names, URLs.
8. No web3 jargon in either language (same rule as the copy review).

## Status

- Foundation + `nav.*` + `notFound.*` done (this PR). NavBar + NotFound converted as the pattern.
- **Fan-out pending**: every other page/component, page-by-page. Best run AFTER the other open shop
  PRs merge (i18n touches every file → doing it before invites big conflicts).
