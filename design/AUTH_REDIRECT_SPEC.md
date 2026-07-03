# Shop Auth: Redirect to Decentraland's AUTH app (localhost + prod)

How the NEW Vite + React shop (`/Users/juanma/Projects/dcl/shop/app`, zustand + react-query,
NON-redux) signs users in by handing off to Decentraland's **auth app** — exactly like the
marketplace does. The user picks their method (wallet / Magic / thirdweb) *in the auth app*,
then returns already signed in. No login modal, no provider popup in the shop.

---

## 0. TL;DR (the mental model)

The marketplace does **not** run its own login modal for the primary flow — its navbar
"Sign in" button just does `window.location.replace(\`${AUTH_URL}/login?redirectTo=...\`)`.
The auth app authenticates, writes the identity to `localStorage` under the key
`single-sign-on-<address>`, then redirects back to `redirectTo`.

Two hard requirements make this work:

1. **Same origin.** The auth app's redirect-back has a security check
   (`redirectToURL.hostname !== window.location.hostname` → rejected). So the auth app must
   be served from the **same origin** as the shop. On localhost that's done with a Vite
   `server.proxy` mapping `/auth` → `https://decentraland.zone`. Then the auth app runs at
   `http://localhost:5173/auth`, `window.location.hostname` inside it is `localhost`, and a
   `redirectTo` pointing at `http://localhost:5173/...` passes the check.
2. **Shared localStorage.** Because the SSO identity is stored in `localStorage` under
   `single-sign-on-<address>` on that same origin, the shop can read it back with
   `localStorageGetIdentity(address)` / `getIdentity(address)` with zero extra plumbing.

There is **no separate SSO iframe** needed. The marketplace and the auth app both rely on the
`@dcl/single-sign-on-client` **localStorage fallback** (see §4). `SingleSignOn.init(SSO_URL)`
is optional and only cross-app-shares identity across *different* origins in prod; on
localhost same-origin it is unnecessary and can be skipped.

---

## 1. The sign-in REDIRECT (marketplace source of truth)

### `AUTH_URL` config value

`webapp/src/config/env/dev.json:44`, `stg.json:44`, `prod.json:44` — **all three** are:

```json
"AUTH_URL": "/auth"
```

It's a **relative path** in every environment. In dev/stg/prod the app is served on the same
host as the auth app (`decentraland.zone` / `decentraland.today` / `decentraland.org`), so
`/auth` resolves to `https://<host>/auth`. On localhost the Vite proxy (§2) makes `/auth`
resolve to the real auth app.

### The redirect code

`webapp/src/components/Navbar/Navbar.tsx:13-20`:

```ts
const handleOnSignIn = useCallback(() => {
  const searchParams = new URLSearchParams(search)
  const currentRedirectTo = searchParams.get('redirectTo')
  const basename = getBasename()
  const redirectTo = !currentRedirectTo ? `${basename}${pathname}${search}` : `${basename}${currentRedirectTo}`

  window.location.replace(`${config.get('AUTH_URL')}/login?redirectTo=${encodeURIComponent(redirectTo)}`)
}, [pathname, search])
```

The same pattern lives in `decentraland-dapps`
(`src/modules/identity/sagas.ts:36,49,69`), which is what the marketplace actually wires up
via `createIdentitySaga({ authURL: config.get('AUTH_URL') })`
(`webapp/src/modules/sagas.ts:64`):

```ts
window.location.replace(`${authURL}/login?redirectTo=${encodeURIComponent(window.location.href)}`)
```

**redirectTo param format:** an **encoded absolute or root-relative URL** back into your app.
`Navbar.tsx` sends `basename + pathname + search` (root-relative, e.g.
`/marketplace/browse`). The dapps saga sends the full `window.location.href`. Either works —
the auth app resolves root-relative against its own origin. For the shop, the simplest correct
value is `window.location.href` (absolute, e.g. `http://localhost:5173/my-assets`).

> **The auth app's return-redirect guard** (`/Users/juanma/Projects/dcl/auth/src/hooks/redirection.ts:49-64`):
> ```ts
> const currentPort = window.location.port
> const allowedPorts = currentPort ? [currentPort] : []      // only the auth app's own port
> if (!validateUrlInstance(redirectToURL, { allowLocalhost: true, allowedPorts })
>     || redirectToURL.hostname !== window.location.hostname) { /* reject → /auth/invalidRedirection */ }
> ```
> Because the proxy serves auth at `localhost:5173`, `window.location.hostname === 'localhost'`
> and `window.location.port === '5173'`, so a `redirectTo` of `http://localhost:5173/...`
> passes both checks. This is the whole reason the proxy (not a second dev server on another
> port) is required.

---

## 2. The VITE proxy / localhost setup

### Marketplace's proxy — `webapp/vite.config.ts:32-44`

```ts
server: {
  open: true,
  proxy: {
    '/auth': {
      target: 'https://decentraland.zone',
      followRedirects: true,
      changeOrigin: true,
      secure: false,
      ws: true
    }
  }
}
```

Requests to `http://localhost:5173/auth/*` are transparently served by the real auth app at
`https://decentraland.zone/auth/*`. Same origin → hostname check passes → shared localStorage.

### Shop replacement — `/Users/juanma/Projects/dcl/shop/app/vite.config.ts`

Add the `proxy` block to the existing `server` config (keep `port: 5173`):

```ts
server: {
  port: 5173,
  proxy: {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    '/auth': {
      target: 'https://decentraland.zone', // .today for stg, .org for prod-mirror
      followRedirects: true,
      changeOrigin: true,
      secure: false,
      ws: true
    }
  }
}
```

**Is a proxy needed? Yes.** Without it, the shop would have to redirect to
`https://decentraland.zone/auth/login`, and the auth app would reject a `redirectTo` back to
`http://localhost:5173` (different hostname), and the SSO identity would land in
`decentraland.zone`'s localStorage where the shop can't read it. The proxy is the mechanism
that makes both the redirect-back and the shared identity work on localhost.

---

## 3. Single Sign-On client — reading the identity after return

### API surface (`@dcl/single-sign-on-client@0.1.0`, already in shop `package.json:17`)

`node_modules/@dcl/single-sign-on-client/dist/SingleSignOn.d.ts`:

```ts
export declare function init(src: string, options?: IsURLOptions): void
export declare function getIdentity(user: string): Promise<AuthIdentity | null>   // iframe, falls back to localStorage
export declare function storeIdentity(user: string, identity: AuthIdentity): Promise<void>
export declare function clearIdentity(user: string): Promise<void>
```

`SingleSignOn.shared.ts` (synchronous localStorage helpers — what marketplace + auth actually use):

```ts
export declare function localStorageGetIdentity(user: string): AuthIdentity | null
export declare function localStorageStoreIdentity(user: string, identity: AuthIdentity): void
export declare function localStorageClearIdentity(user: string): void
```

Key format (`SingleSignOn.shared.js:67-74`): `single-sign-on-${address.toLowerCase()}`, and
`localStorageGetIdentity` auto-drops expired identities.

### How the marketplace uses it

- **It never calls `SingleSignOn.init()` for identity.** Grep of `webapp/src` shows the only
  SSO import is `webapp/src/modules/identity/sagas.ts` using the **localStorage** helpers
  (`localStorageGetIdentity/Store/Clear`), plus dapps
  `src/modules/identity/sagas.ts:3` and `src/containers/SignInPage/SignInPage.container.ts:2`.
- On `CONNECT_WALLET_SUCCESS` it does `localStorageGetIdentity(address)`; if present →
  `generateIdentitySuccess`, else redirect to auth
  (`webapp/src/modules/identity/sagas.ts:60-72`).
- The auth app writes with `localStorageStoreIdentity(address, identity)`
  (`/Users/juanma/Projects/dcl/auth/src/shared/connection/identity.ts:72`).

So marketplace ↔ auth interoperate purely via the **same-origin localStorage key**. The SSO
iframe (`init`) is only for sharing identity across *different* prod origins.

### `init` for the shop — optional, prod-only

Per the client README, the SSO iframe URL is `https://id.decentraland.org`. If you want
cross-app identity sharing in prod you may call it once at startup:

```ts
import * as SingleSignOn from '@dcl/single-sign-on-client'
// prod SSO iframe; harmless-but-unnecessary on localhost (falls back to localStorage anyway)
SingleSignOn.init('https://id.decentraland.org')
```

**On localhost you do not need `init`.** Same-origin localStorage (via the proxy) is enough,
and that's exactly what the marketplace dev flow relies on. Recommended: **skip `init` on
localhost**, gate it behind an env flag for prod.

---

## 4. The RETURN flow — who's signed in, restored on mount, no popup

After the auth app finishes, **two independent things are persisted**:

1. **decentraland-connect** stored the chosen provider/connection (so
   `connection.tryPreviousConnection()` can re-hydrate the wallet without a popup).
2. **SSO** stored the `AuthIdentity` at `single-sign-on-<address>` in localStorage.

On mount the shop reads both. This is already almost exactly what
`/Users/juanma/Projects/dcl/shop/app/src/lib/auth.ts:56-64` (`restoreSession`) and
`store/wallet.ts:27-30` (`restore`) do — they call `connection.tryPreviousConnection()` and
`localStorageGetIdentity`. The one change needed is that **`login()` should redirect to the
auth app instead of opening a provider popup.**

---

## 5. Copy-pasteable code for the shop

### 5a. Auth URL config — `src/config.ts` (extend existing object)

```ts
export const config = {
  marketplaceServerUrl: import.meta.env.VITE_MARKETPLACE_SERVER_URL ?? 'http://localhost:5003',
  nftApiUrl: import.meta.env.VITE_NFT_API_URL ?? 'https://marketplace-api.decentraland.zone',
  chainId: Number(import.meta.env.VITE_CHAIN_ID ?? 80002),

  // Relative like the marketplace: '/auth' is served by the Vite proxy on localhost
  // (§2) and by the same host in deployed envs. Override per-env with VITE_AUTH_URL.
  authUrl: import.meta.env.VITE_AUTH_URL ?? '/auth',

  // Optional SSO iframe for cross-app identity in prod. Empty on localhost → localStorage fallback.
  ssoUrl: import.meta.env.VITE_SSO_URL ?? ''
}
```

`.env.example` additions:

```sh
# Auth app mount point. Leave as /auth to use the Vite proxy on localhost.
VITE_AUTH_URL=/auth
# Prod-only SSO iframe (cross-app identity). Leave empty on localhost.
# VITE_SSO_URL=https://id.decentraland.org
```

### 5b. Vite proxy — `vite.config.ts` (see §2)

```ts
server: {
  port: 5173,
  proxy: {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    '/auth': { target: 'https://decentraland.zone', followRedirects: true, changeOrigin: true, secure: false, ws: true }
  }
}
```

### 5c. SSO init — `src/main.tsx` (top of file, before render; localhost-safe no-op)

```tsx
import * as SingleSignOn from '@dcl/single-sign-on-client'
import { config } from '~/config'

// Only mounts the cross-app SSO iframe when a prod SSO_URL is set. On localhost VITE_SSO_URL
// is empty, so we skip it and rely on same-origin localStorage (via the /auth proxy) —
// exactly how the marketplace dev flow works.
if (config.ssoUrl) {
  SingleSignOn.init(config.ssoUrl)
}
```

### 5d. Sign-in redirect + restore — `src/lib/auth.ts`

Replace the popup-based `login()` with a **redirect to the auth app**. Keep `toSession` and
`restoreSession` (they already read connection + SSO identity). Full file:

```ts
import { ethers } from 'ethers'
import { connection } from 'decentraland-connect'
import { ChainId, ProviderType } from '@dcl/schemas'
import { type AuthIdentity } from '@dcl/crypto'
import { localStorageGetIdentity } from '@dcl/single-sign-on-client'
import { config } from '~/config'

export type Session = {
  address: string
  chainId: number
  signer: ethers.providers.JsonRpcSigner
  web3Provider: ethers.providers.Web3Provider
  identity: AuthIdentity
  providerType: ProviderType
}

async function toSession(res: {
  account: string | null
  provider: unknown
  chainId: ChainId
  providerType: ProviderType
}): Promise<Session> {
  if (!res.account) throw new Error('No account returned by the wallet')
  const address = res.account.toLowerCase()
  const identity = localStorageGetIdentity(address)
  if (!identity) throw new Error('No identity for connected wallet') // caller triggers signIn()
  const web3Provider = new ethers.providers.Web3Provider(res.provider as ethers.providers.ExternalProvider)
  const signer = web3Provider.getSigner()
  return { address, chainId: res.chainId, signer, web3Provider, identity, providerType: res.providerType }
}

/**
 * Hand off to Decentraland's auth app. The user chooses wallet / Magic / thirdweb THERE,
 * signs once, and is redirected back to `redirectTo` already signed in. Mirrors
 * marketplace Navbar.tsx:19 — window.location.replace(`${AUTH_URL}/login?redirectTo=...`).
 * No provider popup happens in the shop.
 */
export function signIn(redirectTo: string = window.location.href): void {
  window.location.replace(`${config.authUrl}/login?redirectTo=${encodeURIComponent(redirectTo)}`)
}

/**
 * Silent restore on mount — no popup. decentraland-connect re-hydrates the provider chosen in
 * the auth app; SSO gives us the identity it stored. If either is missing, return null and let
 * the UI show "Sign in" (which calls signIn()). Mirrors marketplace identity sagas.
 */
export async function restoreSession(): Promise<Session | null> {
  try {
    const res = await connection.tryPreviousConnection()
    if (!res.account || !localStorageGetIdentity(res.account.toLowerCase())) return null
    return await toSession(res)
  } catch {
    return null
  }
}

export async function logout(): Promise<void> {
  try {
    const previous = await connection.tryPreviousConnection().catch(() => null)
    await connection.disconnect()
    const address = previous?.account?.toLowerCase()
    if (address) {
      const { localStorageClearIdentity } = await import('@dcl/single-sign-on-client')
      localStorageClearIdentity(address)
    }
  } catch {
    // ignore
  }
}
```

> Note: the current `lib/auth.ts` `login()` (lines 51-54) calls `connection.connect(providerType)`
> which pops the wallet and generates the identity locally. Replacing it with `signIn()` moves
> the entire method-choice + signature into the auth app. If you want a hybrid (keep an
> in-app "connect wallet" fast path *and* offer the auth app), keep both — but the primary
> button should call `signIn()` to match the marketplace UX.

### 5e. Zustand store — `src/store/wallet.ts`

```ts
import { create } from 'zustand'
import { signIn, logout, restoreSession, type Session } from '~/lib/auth'

type WalletState = {
  session: Session | null
  connecting: boolean
  error: string | null
  signIn: () => void            // redirect to auth app (no popup, no await)
  restore: () => Promise<void>  // silent re-hydrate on mount
  disconnect: () => Promise<void>
}

export const useWallet = create<WalletState>(set => ({
  session: null,
  connecting: false,
  error: null,
  signIn: () => {
    set({ connecting: true, error: null })
    signIn() // full-page redirect; nothing after this runs
  },
  restore: async () => {
    const session = await restoreSession()
    if (session) set({ session })
  },
  disconnect: async () => {
    await logout()
    set({ session: null })
  }
}))
```

### 5f. NavBar wiring — `src/components/NavBar.tsx`

Already calls `restore()` on mount (lines 15-17) — keep it. Change the sign-in handler from
`connect()` to `signIn()`:

```tsx
const { session, connecting, signIn, disconnect, restore } = useWallet()
// ...
useEffect(() => { void restore() }, [restore])   // silent restore after returning from auth
// ...
<Navbar
  // ...
  isSignedIn={!!session}
  isSigningIn={connecting}
  onClickSignIn={() => signIn()}      // ← redirect to auth app
  onClickSignOut={() => void disconnect()}
/>
```

---

## 6. End-to-end flow on localhost

1. User clicks **Sign in** → `signIn()` → `window.location.replace('/auth/login?redirectTo=http%3A%2F%2Flocalhost%3A5173%2Fmy-assets')`.
2. Vite proxy serves the real auth app under `localhost:5173/auth`. User picks
   wallet / Magic / thirdweb, signs once. Auth app calls
   `localStorageStoreIdentity(address, identity)` (`auth/.../identity.ts:72`) and
   decentraland-connect records the provider — both on `localhost` origin.
3. Auth app validates `redirectTo` (same hostname + port `5173` allowed) and does
   `window.location.href = 'http://localhost:5173/my-assets'`.
4. Shop mounts → `NavBar` `useEffect` → `restore()` → `connection.tryPreviousConnection()`
   (no popup) + `localStorageGetIdentity(address)` → `Session` set in zustand. Navbar shows
   the avatar. Done.

---

## 7. Checklist

- [ ] `vite.config.ts`: add `server.proxy['/auth'] → https://decentraland.zone` (§5b).
- [ ] `config.ts`: add `authUrl` (`/auth`) and optional `ssoUrl` (§5a); update `.env.example`.
- [ ] `main.tsx`: conditional `SingleSignOn.init(config.ssoUrl)` (skip on localhost) (§5c).
- [ ] `lib/auth.ts`: replace `login()` with `signIn()` redirect; keep `restoreSession()` (§5d).
- [ ] `store/wallet.ts`: expose `signIn` instead of `connect` (§5e).
- [ ] `NavBar.tsx`: `onClickSignIn={() => signIn()}`; keep `restore()` on mount (§5f).
