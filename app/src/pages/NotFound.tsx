import { Link } from 'react-router-dom'

// Catch-all for unmatched routes (and malformed deep links like /item/<contract> with no id). Keeps
// a bad URL from rendering a blank page — always offers a way back into the shop.
export function NotFound() {
  return (
    <div className="notfound">
      <span className="ico ico-cart notfound__ico" aria-hidden />
      <h1 className="notfound__title">Page not found</h1>
      <p className="muted">The page you&rsquo;re looking for isn&rsquo;t here. Let&rsquo;s get you back to the shop.</p>
      <Link className="btn btn--purple" to="/assets">Browse the shop</Link>
    </div>
  )
}

export default NotFound
