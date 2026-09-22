/**
 * The paths that render the home page, and therefore its hero.
 *
 * Exists so ONE list answers the question in both places that ask it. The build injects a tiny bootstrap
 * into index.html that preloads the hero (see `preloadHero` in vite.config.ts), and that bootstrap runs
 * before the router exists — one `index.html` serves every route, so without a path test it preloads a
 * 55 KB image onto `/items`, `/cart` and `/credits`, at high priority, competing with the content those
 * pages actually render. Spelling the list out twice would let the bootstrap drift from the router in
 * silence: the symptom is a slower LCP on a home entry nobody thought to re-test.
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
