/**
 * The app shell: the company bar, the section navigation, and the page.
 *
 * The bar is `CloudsForgeBar` from @cloudsforge/ui and is never reimplemented. It is passed
 * `PRODUCT` — 'beacon' — so the switcher resolves this surface's entry, which is the entry that
 * has been offering operators a 404 for as long as it has existed.
 *
 * ── There is no mark and no wordmark here, and that is read off the registry ───────────────────
 *
 * `beacon` carries `markId: null` (`ui/packages/ui/src/surfaces.ts:421`), so `Mark surface="beacon"`
 * draws nothing at all (`hasMark`, `ui/packages/ui/src/index.tsx:720-722`). Nothing in this file is
 * designed around a mark. `brand/assets/beacon/` does hold a `mark-1024x1024.png`, which is the
 * SOURCE the favicons were cut from rather than a mark the registry declares —
 * `test/brand-chrome.test.ts` asserts the absence in both directions, so a mark appearing in the
 * registry later fails the build and forces a decision rather than being copied in by reflex.
 * `brand/plan.ts:43` also rules out an og card for this surface, which is why index.html carries no
 * `og:` block.
 */
import { useEffect } from 'react'
import {
  CloudsForgeBar,
  CloudsForgeFooter,
  CookieBanner,
  MainRegion,
  SkipLink,
} from '@cloudsforge/ui'
import { applyHead, surfaceMeta } from '@cloudsforge/ui/seo'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { PRODUCT } from '../lib/hosts.ts'
import { NAV, ROUTES } from '../lib/routes.ts'
import { useSession } from '../lib/auth.tsx'

export function AppShell({ unregistered = false }: { unregistered?: boolean }) {
  const { account, signIn, signOut } = useSession()

  return (
    <>
      {/*
        Skip link first in the DOM: the gate page is a long list of reasons and a keyboard user
        should not have to tab the navigation to reach it.

        IT IS NOW THE SHARED ONE, AND THE LOCAL VERSION IT REPLACES WAS HALF A PATTERN. This file
        wrote its own `.bw-skip` anchor pointing at `#main`, and the `<main id="main">` it pointed
        at carried no `tabIndex={-1}` — so in Chrome and Safari following the link scrolled the
        page, left focus on the link itself, and sent the next Tab back into the company bar. The
        reader arrives looking at the content and tabbing through the chrome, which is the exact
        state the link exists to prevent, and it is invisible to everyone who does not use it.

        `SkipLink` and `MainRegion` set the href and the pair `id` + `tabIndex` from ONE constant
        (`MAIN_ID`, `ui/packages/ui/src/index.tsx:1033`), so the two halves cannot disagree again.
        The id is `cf-main` now rather than `main`. Grepped rather than assumed: two things named
        the old one — the anchor being deleted with it, and `assertSkipLink`'s default target in
        test/journeys/axe.ts, which now reads `MAIN_ID` instead of spelling a landmark's name for a
        fourth time. It had never been called, so it would have gone wrong for the first caller.
      */}
      <SkipLink>Skip to the page</SkipLink>
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
      <DocumentMeta />
      {/*
        `MainRegion` rather than a hand-written `<main>`: it sets `id={MAIN_ID}` and `tabIndex={-1}`
        together, which is the pair the skip link above needs and the pair this file used to get
        half right. `className` is still this bundle's own — the layout is local, the landmark is
        shared.
      */}
      <MainRegion className="bw-main">
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
      </MainRegion>

      {/*
        The company footer, from @cloudsforge/ui, and NEVER a local copy. Every link is derived from
        the surface registry, so a new product appears here without this file changing. `beacon`
        became `servesUi: true` (`ui/packages/ui/src/surfaces.ts:446`), which means all sixteen other
        surfaces now derive a link TO this one from that same row — and until this commit the page
        they arrived at rendered no footer at all and offered no way back.

        IT IS OUTSIDE THE GATE ON PURPOSE. `app.tsx` wraps each PAGE in `<Gate>`, not the shell, so
        a signed-out visitor gets the sign-in panel inside `<main>` with this footer underneath it.
        On an `adminOnly` surface (`surfaces.ts:448`) that is the state that matters most: the
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

      {/*
        Last in the document, and therefore last in the tab order. That is deliberate: the banner is
        a dialog and is explicitly NOT modal, so an operator who came here to read why a release was
        refused can read it and answer afterwards. A consent banner that traps focus is the coercion
        the regulation is about.

        ON THIS SURFACE IT RENDERS NOTHING, TODAY AND ON PURPOSE. `CookieBanner` returns null when
        `analyticsId()` is null (`ui/packages/ui/src/index.tsx:1196`), and it is null here because
        index.html carries no `<meta name="cf-analytics">` — see the long note where that tag would
        have gone, which comes down to `beacon` being `adminOnly: true` (`surfaces.ts:448`): GA4
        reports `page_location`, so a hit from an operator console ships the estate's own addresses
        to a third party.

        Mounting it anyway costs one component that returns null, and buys the property that the
        shell is the same shape as every other surface's. The failure this prevents is the one where
        somebody adds the meta tag — which would need that note argued with first — and the gate is
        not already in front of it.
      */}
      <CookieBanner />
    </>
  )
}

/**
 * Keep `document.title`, the description, the robots directive, the Open Graph tags and the
 * canonical link in step with the address.
 *
 * A component in the shell rather than a hook each page calls, because the failure mode of the
 * second shape is the page that forgets to call it — and the page that forgets is the one added
 * last, which is the one nobody has bookmarked and therefore the one nobody notices is titled with
 * the previous page's title. On this surface that is worse than cosmetic: an operator keeps six
 * tabs open on the same console, and the tab strip is the only thing telling them apart.
 *
 * ── What this does NOT replace ────────────────────────────────────────────────────────────────
 *
 * The static tags in `index.html`. Those are what a fetcher that does not execute JavaScript gets,
 * and this is the layer a browser sees. The trade is inherited rather than introduced; it is
 * written down at the top of `@cloudsforge/ui/seo` so the next person makes it deliberately.
 *
 * ── Where the words come from ─────────────────────────────────────────────────────────────────
 *
 * `surfaceMeta('beacon', …)` derives the name and the description from the surface registry, which
 * already holds both. The only thing this file adds is which page you are on, and that is read off
 * `ROUTES` — the same declaration the sub-navigation, the router and nginx's enumerated locations
 * are derived from — rather than typed a fifth time. An address `ROUTES` does not know is the 404
 * page, and it gets the surface name alone: the shell cannot say what a mistyped address was for.
 *
 * ── The robots directive is DERIVED, and there is no override here ────────────────────────────
 *
 * `robotsDirective()` (`ui/packages/ui/src/seo.ts:139-142`) reads `servesUi` and `adminOnly` and
 * nothing else, and `beacon` carries `adminOnly: true` (`ui/packages/ui/src/surfaces.ts:448`), so
 * every page here resolves to `noindex, nofollow` — which is the same string index.html states
 * statically. `test/sitemap.test.ts` asserts the two agree by CALLING `surfaceMeta` rather than by
 * retyping it, so a registry row that stopped being `adminOnly` would go red here instead of
 * quietly leaving a console asking not to be indexed for a reason nobody had recorded.
 *
 * ── The one tag this emits that this surface cannot honour ────────────────────────────────────
 *
 * `og:image` and `twitter:image`, which `metaTags` composes from `DEFAULT_OG_IMAGE` —
 * `/og-1200x630.png` — and this surface deliberately ships no such file: `brand/plan.ts:43` says
 * "No OG card and no social banner for Admin, Lantern or Beacon", and `test/brand-chrome.test.ts`
 * asserts the absence in both directions.
 *
 * It is left as it is rather than stripped, and that is a decision. The only reader of those two
 * tags is a client that executes JavaScript AND ignores the `noindex, nofollow` written beside
 * them — the link-preview fetchers that would actually fetch the card do not run scripts, and get
 * index.html, which carries no `og:` block at all and never will. Deleting the tags after
 * `applyHead` wrote them would mean this repository disagreeing locally with the shared module,
 * which is the per-surface divergence the module exists to end; and the day `brand/plan.ts` gives
 * Beacon a card, `public/og-1200x630.png` appears and these tags become correct with no edit here.
 */
function DocumentMeta() {
  const { pathname } = useLocation()

  useEffect(() => {
    // The first path segment, which is what `ROUTES.path` holds: `''` for the index, `journeys`
    // for `/journeys`. Nothing on this surface has children, so one segment is the whole key.
    const segment = pathname.split('/')[1] ?? ''
    const label = ROUTES.find((route) => route.path === segment)?.label ?? null
    applyHead(
      surfaceMeta(PRODUCT, { ...(label === null ? {} : { title: label }), path: pathname }),
      window.location.origin,
    )
  }, [pathname])

  return null
}
