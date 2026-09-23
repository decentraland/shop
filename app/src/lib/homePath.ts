/**
 * The paths that render the home page, and therefore its hero.
 *
 * Read by the build, not by the router: `vite-plugins/preloadHero.ts` injects a bootstrap into index.html that
 * preloads the hero, and that bootstrap runs before the router exists. One `index.html` serves every
 * route, so without a path test it preloads a 55 KB image onto `/items`, `/cart` and `/credits`, at high
 * priority, competing with the content those pages do render.
 *
 * The list MIRRORS the routes declared in App.tsx — nothing enforces that, which is why it lives in one
 * tested module rather than inline in the build config. Add a home route there and add it here.
 *
 * `''` is `/` with its trailing slash stripped. It belongs here because `/` renders through the same
 * document and redirects to `/overview` client-side, so the hero is what it paints. `/shop` and
 * `/shop/overview` are the deployed Shop, which is served under that prefix (see the router basename in
 * main.tsx); locally and on preview deploys the app is at the root.
 */
export const HOME_PATHS = ['', '/overview', '/shop', '/shop/overview']

/** Whether `pathname` is a home entry. Trailing slashes are stripped; the query is not part of it. */
export function isHomePath(pathname: string): boolean {
  return HOME_PATHS.includes(pathname.replace(/\/+$/, ''))
}
