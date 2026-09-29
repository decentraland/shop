/**
 * Where clearing the search box should navigate, or null to stay put.
 *
 * Clearing the box is about the box: on the results page it also drops the query from the URL, keeping
 * every other filter, because the grid is showing that query's results. Anywhere else — the home, an
 * item, a creator's page — it must not move the reader; it used to send everyone to /items.
 */
export function clearedSearchUrl(pathname: string, search: string): string | null {
  if (pathname !== '/items') return null
  const params = new URLSearchParams(search)
  if (!params.has('q')) return null
  params.delete('q')
  const rest = params.toString()
  return rest ? `/items?${rest}` : '/items'
}
