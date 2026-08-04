/**
 * The page for an address this app does not serve.
 *
 * It is rendered under a REAL 404. nginx.conf enumerates the routes and serves this bundle through
 * `error_page 404 /index.html`, which keeps the status line honest — see the header of that file.
 * So this component never has to apologise for a 200 pretending to be a miss.
 */
import { Link } from 'react-router-dom'
import { NAV } from '../lib/routes.ts'

export function NotFoundPage() {
  return (
    <div className="bw-state bw-state--missing" role="status">
      <span className="bw-state__icon" aria-hidden="true">
        ⌀
      </span>
      <p className="bw-state__title">This console does not serve that address</p>
      <p className="bw-state__hint">
        The server answered <span className="cf-num">404</span> and then served this bundle, so the
        status line and this page agree. Nothing was asked of Beacon.
      </p>
      <ul className="bw-state__links">
        {NAV.map((item) => (
          <li key={item.to}>
            <Link to={item.to}>{item.label}</Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
