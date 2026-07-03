# Navbar + Auth Integration Spec (Shop — non-redux Vite + React)

How the new "shop" app (zustand + react-query, **no redux**) reuses Decentraland's
shared top Navbar (with the right-side avatar / user menu / sign-in) exactly like the
marketplace webapp does — plus the auth wiring behind it.

Everything below is verified against source in:
- `/Users/juanma/Projects/dcl/marketplace/webapp` (the marketplace)
- `/Users/juanma/Projects/dcl/decentraland-dapps` (the redux dapps library)
- `decentraland-ui2` (in `node_modules`)

---

## TL;DR

- **The Navbar the marketplace visually renders is `Navbar` from `decentraland-ui2`.**
  It is a **fully presentational** component — plain props, no redux, no context.
- The marketplace does NOT use it directly; it uses the **redux container `Navbar2`**
  from `decentraland-dapps/dist/containers/Navbar`, which is just a `connect()` wrapper
  that reads wallet/profile/credits/locale from the redux store and forwards them to the
  `decentraland-ui2` `Navbar`.
- **For the shop: skip the dapps container. Import the `decentraland-ui2` `Navbar`
  directly and feed it plain props from your zustand wallet store.** No redux, no sagas,
  no providers. This is option (a) and it is the real, recommended path.
- The right-side avatar + user menu are rendered **internally** by the `decentraland-ui2`
  `Navbar` (via its private `UserCardPanel`). There is no separate `UserMenu` to wire —
  you just pass `isSignedIn`, `address`, and `avatar`.

---

## 1) Which Navbar does the marketplace render?

**Chain of components (verified):**

```
webapp/src/components/Navbar/Navbar.tsx
   └─ imports Navbar2 as BaseNavbar2 from 'decentraland-dapps/dist/containers/Navbar'   (webapp Navbar.tsx:3)

decentraland-dapps/src/containers/Navbar/Navbar2.container.tsx
   └─ connect(mapState, mapDispatch)(Navbar2)                                            (Navbar2.container.tsx:44)

decentraland-dapps/src/containers/Navbar/Navbar2.tsx
   └─ import { Navbar as NavbarComponent } from 'decentraland-ui2'                        (Navbar2.tsx:5)
   └─ renders <NavbarComponent .../>                                                      (Navbar2.tsx:114)

decentraland-ui2/dist/components/Navbar/Navbar.js   ← THE ACTUAL PRESENTATIONAL NAVBAR
```

So: the marketplace renders **`decentraland-ui2`'s presentational `Navbar`**, wrapped by
the **redux container `Navbar2`** from decentraland-dapps.

**Props the webapp's own wrapper passes** (`webapp/src/components/Navbar/Navbar.tsx:37-48`):

```tsx
<BaseNavbar2
  {...props}                    // identity comes in via redux (see below)
  withChainSelector             // dapps-container prop
  withNotifications             // dapps-container prop
  showManaBalancesInNavbar      // forwarded to the ui2 Navbar (@ts-expect-error in webapp)
  activePage="shop"             // ui2 prop: highlights the "Shop" tab
  identity={props.identity}     // dapps-container prop (used only for notifications fetch)
  onSignIn={handleOnSignIn}     // dapps-container prop → ui2 `onClickSignIn`
/>
```

- The **only** thing the webapp's own `Navbar.container.ts` injects from redux is
  `identity` (`getCurrentIdentity`), used purely to drive the notifications panel
  (`webapp/src/components/Navbar/Navbar.container.ts:7-9`).
- `handleOnSignIn` does a **full-page redirect to the auth site**:
  `window.location.replace(`${AUTH_URL}/login?redirectTo=...`)`
  (`webapp/src/components/Navbar/Navbar.tsx:13-20`). That is the marketplace's chosen
  sign-in UX. The shop can instead call its own in-app connect flow (see §4).

**What the dapps container `Navbar2` injects from redux**
(`decentraland-dapps/src/containers/Navbar/Navbar2.container.tsx:21-42`):

| ui2 Navbar prop | redux source |
| --- | --- |
| `avatar` | `getProfiles(state)[address].avatars[0]` (profile module) |
| `address` | `getAddress(state)` (wallet module) |
| `isSignedIn` | `isConnected(state)` |
| `isSigningIn` | `isConnecting(state)` |
| `manaBalances` | `getManaBalances(state)` |
| `chainId` / `selectedChain` | `getChainId(state)` |
| `chains` | `getAvailableChains()` (only when `withChainSelector`) |
| `creditsBalance` | derived from `getCredits(state, address)` |
| `locale` | `getLocale(state)` (translation module) |
| `onClickSignOut` | `dispatch(disconnectWalletRequest())` |
| `onSelectChain` | `dispatch(switchNetworkRequest(...))` |
| `onClickBalance` | opens `${BASE_URL}/account` (in `Navbar2.tsx:70-78`) |

**Every one of these is a plain value or callback.** The container only exists to pull
them out of redux. In a non-redux app you supply the same values yourself.

---

## 2) The right-side avatar / user menu

- There is **no separate `UserMenu` you need to mount.** The `decentraland-ui2` `Navbar`
  renders the avatar + dropdown internally via its private `UserCardPanel`
  (`decentraland-ui2/dist/components/Navbar/Navbar.js:109` renders `<UserCardPanel .../>`;
  component in `UserCardPanel.js`).
- `decentraland-ui2` also exports a standalone `UserMenu`
  (`decentraland-ui2/dist/components/UserMenu/`) but the marketplace's `Navbar2` does
  **not** use it — the avatar/menu is baked into the `Navbar`. **Ignore `UserMenu` for the shop.**

**Data the avatar/user-menu needs** (from `UserCardPanel.js:43-53` and `NavbarProps`):

- `isSignedIn: boolean` — controls whether the avatar button + menu (vs. the SIGN IN
  button) is shown (`Navbar.js:109`, `!isSignedIn && <SignInButton .../>`).
- `address?: string` — used for the shortened display and the "copy address" action.
- `avatar?: { name?: string; avatar?: { snapshots?: { face256?: string; body?: string } } }`
  — the face image (avatar button) and body image (open card). Snapshot values may be a
  bare content hash; `UserCardPanel` prefixes them with
  `https://peer.decentraland.org/content/contents/` automatically, or accepts a full URL
  (`UserCardPanel.js:14-25`). Falls back to the DCL logo if no face.
- `onClickSignOut: () => void` — the "Log Out" menu item.
- `isLoadingProfile?: boolean` — shows a pulsing placeholder while the profile loads.

**Does it require redux / dapps providers?** No. The `decentraland-ui2` `Navbar` and
`UserCardPanel` import **nothing** from redux, react-redux, or decentraland-dapps. Verified:
their styled files only import `@emotion/styled`, `@emotion/react`, and a **static** color
palette (`import * as colors from '../../theme/colors'` in `Navbar.styled.js:3`) — there
are **no `({ theme }) => ...` style callbacks**, so no MUI/emotion `ThemeProvider` is
required for the Navbar to render. (Individual `grep` of every `*.styled.js` in the Navbar
folder shows exactly one `theme` token per file, and it is the `keyframes`-from-emotion
import line, not a theme accessor.)

The presentational `decentraland-ui2` `Navbar` can be used **directly with plain props** →
this is what the shop should do.

---

## 3) Minimal way to render this Navbar in a non-redux app → **Option (a)**

**Recommendation: Option (a) — use `decentraland-ui2`'s `Navbar` directly.** Option (b)
(bootstrapping a redux store with wallet+profile+identity+translation reducers and sagas)
is real but is exactly the weight the shop was built to avoid; it buys you nothing here,
because every value the container computes is trivially reproducible from the shop's
existing `src/lib/auth.ts` + a small profile fetch.

### 3.1 Exact import + prop shape

```ts
import { Navbar } from 'decentraland-ui2'
// Type: import type { NavbarProps } from 'decentraland-ui2'
//       (defined in decentraland-ui2/dist/components/Navbar/Navbar.types.d.ts:33-76)
```

`NavbarProps` (the full presentational contract — copy-paste reference):

```ts
type NavbarProps = {
  isSignedIn: boolean            // REQUIRED
  isSigningIn?: boolean
  isLoadingProfile?: boolean
  address?: string
  avatar?: {
    name?: string
    avatar?: { snapshots?: { face256?: string; body?: string } }
  }
  i18n?: Partial<NavbarI18n>     // override any label (see Navbar.defaults.js)
  notificationSlot?: ReactNode   // leave undefined — shop has no notifications
  selectedChain?: ChainId        // for the in-card chain pill
  chains?: ChainId[]             // list to pick from; omit to hide chain selector
  onSelectChain?: (chain: ChainId) => void
  manaBalances?: Partial<Record<Network, number>>   // { ETHEREUM, MATIC }
  onClickBalance?: (network: Network) => void
  showManaBalancesInNavbar?: boolean   // true = show MANA pills in top bar
  creditsBalance?: { balance: number; expiresAt: number }
  onClickCredits?: () => void
  onToggleUserCard?: (isOpen: boolean) => void
  activePage?: 'whatsOn' | 'shop' | 'create' | 'learn'
  onClickSignIn: () => void      // REQUIRED
  onClickSignOut: () => void     // REQUIRED
}
```

### 3.2 zustand wallet store (new — `src/stores/wallet.ts`)

Wraps the existing `src/lib/auth.ts` (`login` / `logout` / `restoreSession`).

```ts
// src/stores/wallet.ts
import { create } from 'zustand'
import { ProviderType } from '@dcl/schemas'
import type { AuthIdentity } from '@dcl/crypto'
import { login, logout, restoreSession, type Session } from '~/lib/auth'

type WalletState = {
  address?: string
  chainId?: number
  identity?: AuthIdentity
  isSignedIn: boolean
  isSigningIn: boolean
  connect: (providerType?: ProviderType) => Promise<void>
  disconnect: () => Promise<void>
  restore: () => Promise<void>
}

function apply(set: (p: Partial<WalletState>) => void, s: Session | null) {
  if (!s) {
    set({ address: undefined, chainId: undefined, identity: undefined, isSignedIn: false })
    return
  }
  set({ address: s.address, chainId: s.chainId, identity: s.identity, isSignedIn: true })
}

export const useWallet = create<WalletState>((set) => ({
  isSignedIn: false,
  isSigningIn: false,
  connect: async (providerType = ProviderType.INJECTED) => {
    set({ isSigningIn: true })
    try {
      apply(set, await login(providerType))
    } finally {
      set({ isSigningIn: false })
    }
  },
  disconnect: async () => {
    await logout()
    apply(set, null)
  },
  restore: async () => {
    apply(set, await restoreSession())
  }
}))
```

### 3.3 Profile / avatar via react-query (new — `src/hooks/useProfile.ts`)

The avatar snapshots come from the Catalyst lambdas profile endpoint. dapps does this via
`PeerAPI.fetchProfile` → `GET {peerUrl}/lambdas/profiles/{address}` (batch POST variant in
`decentraland-dapps/src/lib/peer.ts:13-43`). The shop only needs the first avatar's
snapshots, so a plain fetch is enough:

```ts
// src/hooks/useProfile.ts
import { useQuery } from '@tanstack/react-query'

// zone for dev/testnet, org for prod. Pick per your VITE env.
const PEER_URL = import.meta.env.VITE_PEER_URL ?? 'https://peer.decentraland.zone'

type ProfileAvatar = {
  name?: string
  avatar?: { snapshots?: { face256?: string; body?: string } }
}

export function useProfile(address?: string) {
  return useQuery({
    queryKey: ['profile', address],
    enabled: !!address,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<ProfileAvatar | undefined> => {
      const res = await fetch(`${PEER_URL}/lambdas/profiles/${address!.toLowerCase()}`)
      if (!res.ok) return undefined
      const profile = await res.json()
      return profile?.avatars?.[0] as ProfileAvatar | undefined
    }
  })
}
```

### 3.4 The shop Navbar wrapper (replaces the placeholder `src/components/NavBar.tsx`)

```tsx
// src/components/NavBar.tsx
import { useEffect } from 'react'
import { Navbar } from 'decentraland-ui2'
import { useWallet } from '~/stores/wallet'
import { useProfile } from '~/hooks/useProfile'

export function NavBar() {
  const { address, isSignedIn, isSigningIn, connect, disconnect, restore } = useWallet()
  const { data: avatar, isLoading: isLoadingProfile } = useProfile(address)

  // Re-establish the previous wallet session on load (silent, no popup).
  useEffect(() => {
    void restore()
  }, [restore])

  return (
    <Navbar
      activePage="shop"
      isSignedIn={isSignedIn}
      isSigningIn={isSigningIn}
      isLoadingProfile={isSignedIn && isLoadingProfile}
      address={address}
      avatar={avatar}
      onClickSignIn={() => void connect()}
      onClickSignOut={() => void disconnect()}
      // Optional extras once the shop has data for them:
      // manaBalances={{ ETHEREUM: 0, MATIC: 0 }}
      // showManaBalancesInNavbar
      // creditsBalance={{ balance: 0, expiresAt: 0 }}
    />
  )
}
```

That is the whole integration. `App.tsx` already renders `<NavBar />`, so no other change
is needed there.

> **Note on `onClickSignIn`.** The marketplace redirects to the external auth site. The
> shop already has an in-app connect flow in `src/lib/auth.ts`, so the button should call
> `connect()` directly (which pops the wallet / opens the connect UI). If you later want a
> provider chooser (injected vs. Magic vs. WalletConnect), render your own modal on
> `onClickSignIn` and pass the chosen `ProviderType` into `connect()`.

---

## 4) Auth logic to copy from the marketplace

The shop's `src/lib/auth.ts` **already implements the same primitives** the marketplace
uses under its wallet/identity sagas. Mapping:

| Concern | Marketplace (redux) | decentraland-dapps source | Shop equivalent (already present) |
| --- | --- | --- | --- |
| Connect wallet | `CONNECT_WALLET_REQUEST` saga → `connection.connect(providerType, chainId)` | `decentraland-dapps/src/modules/wallet/sagas.ts:63-70` (`getAccount`) | `login()` → `connection.connect(...)` in `auth.ts:51-54` |
| Restore prev session | on load, `tryPreviousConnection()` | `wallet/sagas.ts` (connect success flow) | `restoreSession()` → `connection.tryPreviousConnection()` in `auth.ts:56-64` |
| Create identity | identity saga: ephemeral key + `Authenticator.initializeAuthChain`, sign with wallet | `decentraland-dapps/src/modules/identity/sagas.ts` | `toSession()` → `Authenticator.initializeAuthChain(...)` in `auth.ts:31-46` |
| Persist identity (SSO) | `@dcl/single-sign-on-client` `localStorageStoreIdentity` / `localStorageGetIdentity` | identity saga | `auth.ts:32,45` (get + store) |
| Sign out | `disconnectWalletRequest()` → `connection.disconnect()` | `wallet/sagas.ts:141` | `logout()` → `connection.disconnect()` in `auth.ts:66-72` |

**How the navbar hooks in:**

- Sign-in button (`onClickSignIn`) → `useWallet().connect()` → `auth.login()`
  → `decentraland-connect` `connection.connect(providerType, chainId)` opens the wallet /
  provider (injected / Magic / WalletConnect are all handled by `decentraland-connect`
  internally based on `ProviderType`) → on success, `toSession()` reuses or mints an
  `AuthIdentity` via `@dcl/crypto` `Authenticator` + `@dcl/single-sign-on-client`, and the
  store flips `isSignedIn = true`. The Navbar re-renders showing the avatar.
- Sign-out (`onClickSignOut`) → `useWallet().disconnect()` → `auth.logout()`
  → `connection.disconnect()`, store clears, Navbar shows the SIGN IN button again.
- On mount, `useWallet().restore()` calls `auth.restoreSession()` so a returning user
  keeps their session with **no popup** (identity is read from SSO local storage).

The identity (`AuthIdentity`) held in the store is what the shop uses to sign trades
(see `SELL_INTEGRATION_SPEC.md` / `src/lib/trades.ts`) — same identity the marketplace's
`getCurrentIdentity` selector returns.

---

## 5) Gotchas

1. **No `ThemeProvider` needed for the Navbar itself.** Its styles use a static color
   palette, not theme callbacks (`Navbar.styled.js:3`). If you use *other* `decentraland-ui2`
   components (buttons, dialogs, etc.) that DO read `theme`, wrap the app once:
   ```tsx
   import { DclThemeProvider, darkTheme } from 'decentraland-ui2'
   // <DclThemeProvider theme={darkTheme}> ... </DclThemeProvider>
   ```
   (Exports verified in `decentraland-ui2/dist/index.d.ts:5` —
   `ThemeProvider as DclThemeProvider`, `dark as darkTheme`.) Not required just for the Navbar.

2. **No I18n / Intl provider needed.** The Navbar ships its own English defaults
   (`Navbar.defaults.js` `DEFAULT_I18N`). Override strings via the `i18n` prop if desired.
   (This is unlike the *old* decentraland-ui `Navbar`, which needed a translations provider —
   the ui2 one does not.)

3. **No `ModalProvider` needed.** The user card / dropdowns are plain DOM inside the Navbar.
   (You'd only need a modal provider for the dapps `UnsupportedNetworkModal`, which the shop
   is not using — that only comes from the dapps container `Navbar2`, not the ui2 `Navbar`.)

4. **The Navbar menu links point to the DCL environment via `@dcl/ui-env`.** The ui2 Navbar
   builds its Shop/Create dropdowns and user-menu links from `decentraland-ui2/dist/config`
   (`Navbar.defaults.js:1,35-96`), a self-initializing `@dcl/ui-env` config that auto-selects
   dev(`.zone`) / stg(`.today`) / prod(`.org`). No init call is required, but if the links
   resolve to the wrong environment, set the standard DCL env var
   (`VITE_DCL_DEFAULT_ENV` / `window` env, per `@dcl/ui-env`) before first render.

5. **`decentraland-connect` needs Node/browser polyfills under Vite.** The shop already has
   `vite-plugin-node-polyfills` in `devDependencies` (package.json) — keep it enabled;
   `connection.connect` / WalletConnect pull in `buffer`/`process`/crypto globals.

6. **CSS imports:** the ui2 `Navbar` styles are emotion-in-JS, so **no CSS file import is
   required**. (Do NOT import `decentraland-ui/lib/styles.css` — that's the old library.)
   The Navbar is `position: fixed; height 92px desktop / 64px mobile` (`Navbar.styled.js:41-81`),
   so add top padding to `.page` in `index.css` so content isn't hidden under it.

7. **`avatar` snapshot URLs.** Pass either a full URL or a bare content hash — the Navbar
   resolves bare hashes against `peer.decentraland.org` automatically
   (`UserCardPanel.js:14-25`). The `useProfile` hook above returns the lambdas shape as-is.

8. **Do not accidentally import the dapps container.** `decentraland-dapps/dist/containers/Navbar`
   pulls in react-redux and the whole wallet/profile/credits selector graph and will throw
   without a redux `<Provider>`. The shop must import from **`decentraland-ui2`** only.

---

## Files to add / change in the shop

| File | Action |
| --- | --- |
| `src/stores/wallet.ts` | **new** — zustand wallet store wrapping `lib/auth.ts` (§3.2) |
| `src/hooks/useProfile.ts` | **new** — react-query avatar fetch from Catalyst lambdas (§3.3) |
| `src/components/NavBar.tsx` | **replace** the placeholder shell with the ui2 `Navbar` wrapper (§3.4) |
| `src/App.tsx` | no change — already renders `<NavBar />` |
| `src/main.tsx` | optional — wrap in `<DclThemeProvider theme={darkTheme}>` only if other ui2 themed components are added |
| `index.css` | add top padding to `.page` to clear the fixed 92px navbar |
| `.env` / `.env.example` | optional `VITE_PEER_URL`; set DCL env for correct menu-link environment |
