/**
 * The app shell: the company bar, the section navigation, and the page.
 *
 * The bar is `CloudsForgeBar` from @cloudsforge/ui and is never reimplemented. It is passed
 * `PRODUCT` — 'beacon' — so the switcher resolves this surface's entry, which is the entry that
 * has been offering operators a 404 for as long as it has existed.
 *
 * ── There is no mark and no wordmark here, and that is read off the registry ───────────────────
 *
 * `beacon` carries `markId: null` (`ui/packages/ui/src/surfaces.ts`), so `Mark surface="beacon"`
 * draws nothing at all (`hasMark`, `ui/packages/ui/src/index.tsx`). Nothing in this file is
 * designed around a mark. `brand/assets/beacon/` does hold a `mark-1024x1024.png`, which is the
 * SOURCE the favicons were cut from rather than a mark the registry declares —
 * `test/brand-chrome.test.ts` asserts the absence in both directions, so a mark appearing in the
 * registry later fails the build and forces a decision rather than being copied in by reflex.
 * `brand/plan.ts` also rules out an og card for this surface, which is why index.html carries no
 * `og:` block.
 */
import { CloudsForgeBar, CloudsForgeFooter } from '@cloudsforge/ui'
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

      {/*
        The company footer, from @cloudsforge/ui, and NEVER a local copy. Every link is derived from
        the surface registry, so a new product appears here without this file changing. `beacon`
        became `servesUi: true` (`ui/packages/ui/src/surfaces.ts`), which means all sixteen other
        surfaces now derive a link TO this one from that same row — and until this commit the page
        they arrived at rendered no footer at all and offered no way back.

        IT IS OUTSIDE THE GATE ON PURPOSE. `app.tsx` wraps each PAGE in `<Gate>`, not the shell, so
        a signed-out visitor gets the sign-in panel inside `<main>` with this footer underneath it.
        On an `adminOnly` surface (`surfaces.ts`) that is the state that matters most: the
        reader who cannot sign in is the one with nothing else on the screen to navigate by.

        ── THE NOTE IS THE OPPOSITE OF `status`'s, AND THAT IS WHY IT IS WORTH SAYING ──────────────

        `status-web`'s footer closes with "this page is served independently of the systems it
        describes". That is true there and FALSE here, and a reader who has seen the sentence on one
        CloudsForge surface would reasonably carry it to the other. This console shares
        `beacon.<apex>` with `micro-beacon` itself — that is not a preference but a requirement, as
        the header above records: Beacon sends no `access-control-*` header anywhere and 404s a
        preflight, so a console on any other hostname could not read it at all. The cost of that
        arrangement is exactly this: the page cannot outlive the thing it reports on, and a reader
        deciding whether to promote a release should be told so on the page, not in a repository.
      */}
      <CloudsForgeFooter
        current={PRODUCT}
        account={account}
        note={
          <>
            This console is served from the same hostname as the service it reads. Unlike the public
            status page, it cannot report on an outage that takes Beacon itself down — if this page
            does not load, that is not evidence of anything.
          </>
        }
      />
    </>
  )
}
