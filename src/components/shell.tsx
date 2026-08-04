/**
 * The app shell: the company bar, the section navigation, and the page.
 *
 * The bar is `CloudsForgeBar` from @cloudsforge/ui and is never reimplemented. It is passed
 * `PRODUCT` — 'beacon' — so the switcher resolves this surface's entry, which is the entry that
 * has been offering operators a 404 for as long as it has existed.
 *
 * ── There is no mark and no wordmark here, and that is read off the registry ───────────────────
 *
 * `beacon` carries `markId: null` (`ui/packages/ui/src/surfaces.ts:400`), so `Mark surface="beacon"`
 * draws nothing at all (`hasMark`, `ui/packages/ui/src/index.tsx:569-571`). Nothing in this file is
 * designed around a mark. `brand/assets/beacon/` does hold a `mark-1024x1024.png`, which is the
 * SOURCE the favicons were cut from rather than a mark the registry declares —
 * `test/brand-chrome.test.ts` asserts the absence in both directions, so a mark appearing in the
 * registry later fails the build and forces a decision rather than being copied in by reflex.
 * `brand/plan.ts:43` also rules out an og card for this surface, which is why index.html carries no
 * `og:` block.
 */
import { CloudsForgeBar } from '@cloudsforge/ui'
import { NavLink, Outlet } from 'react-router-dom'
import { PRODUCT } from '../lib/hosts.ts'
import { NAV } from '../lib/routes.ts'
import { useSession } from '../lib/auth.tsx'

export function AppShell({ unregistered = false }: { unregistered?: boolean }) {
  const { account, signIn, signOut } = useSession()

  return (
    <>
      {/* Skip link first in the DOM: the gate page is a long list of reasons and a keyboard user
          should not have to tab the navigation to reach it. */}
      <a className="bw-skip" href="#main">
        Skip to the page
      </a>
      <CloudsForgeBar
        current={PRODUCT}
        account={account}
        onSignIn={() => signIn()}
        onSignOut={signOut}
      />
      {/*
        The sub-nav is sticky at exactly `var(--cf-bar-h)` — the bar's own height token, not a
        number copied out of it. When the bar's height changes, this moves with it.
      */}
      <nav className="bw-subnav" aria-label="Sections">
        <div className="bw-subnav__inner">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) => `bw-subnav__link${isActive ? ' is-active' : ''}`}
            >
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>
      <main className="bw-main" id="main">
        {/*
          An unregistered placement is closer to a refusal here than it is on a public surface, and
          the notice says both halves of why.

          `cloudsforgeHosts()` derives the apex by stripping a KNOWN subdomain, so an address the
          registry does not know makes every estate URL resolve one level too deep. On this surface
          that also decides the API base: `resolveApiBase` returns the ABSOLUTE Beacon origin from
          an unregistered non-local address, and a cross-origin request to Beacon cannot complete
          at all, because Beacon sends no `access-control-*` header and answers 404 to a preflight.
          So the panels below will fail, the failure will appear in the browser console rather than
          in any server log, and this is the only place that can say why in advance.
        */}
        {unregistered && (
          <p className="bw-note bw-note--stop" role="status">
            <span className="bw-note__icon" aria-hidden="true">
              ■
            </span>
            <span>
              This bundle is being served from an address the CloudsForge surface registry does not
              know. Every host it resolves is derived from the wrong apex, and its requests to
              Beacon are therefore cross-origin — which Beacon cannot answer, because it sends no
              CORS header and refuses a preflight. Its home is the{' '}
              <code className="cf-num bw-code">beacon</code> surface, where the bundle and the
              service share one hostname.
            </span>
          </p>
        )}
        <Outlet />
      </main>
    </>
  )
}
