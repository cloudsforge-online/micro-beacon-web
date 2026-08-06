/**
 * The built bundle, in real Chromium, behind a model of this repository's own nginx.conf.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * THE NETWORK BELOW IS STUBBED, AND NOTHING IN THIS FILE IS EVIDENCE THAT ANYTHING IS REACHABLE.
 *
 * The entry point is called `renderOnlyWithStubbedNetwork` for exactly that reason and its own
 * header carries the full account. What these scenarios prove is what the page DOES with an
 * answer — which is genuine rendering logic, is cheap, is deterministic and needs no estate.
 *
 * The tier that CAN answer reachability is `micro-beacon`'s smoke tier, in the repository this
 * bundle is the console for. That division is not an abstraction here: `beacon/src/browser/smoke.ts`
 * is next door, it drives real Chromium through the real gateway with nothing intercepted, and it
 * fails structurally if an intercept ever appears in it.
 *
 * These five scenarios were also driven WITHOUT any interception, against the running estate, and
 * the README records what appeared on screen. That is the evidence; this is the regression net.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict'
import { after, describe, it } from 'node:test'
import { MAIN_ID, SURFACES } from '@cloudsforge/ui'
import { surfaceMeta } from '@cloudsforge/ui/seo'
import { robotsTxt } from '@cloudsforge/ui/sitemap'
import { assertLandmarks, assertSkipLink } from './journeys/axe.ts'
import {
  assertMounted,
  closeBrowser,
  renderOnlyWithStubbedNetwork,
  type SentRequest,
  type Session,
  type Stubs,
} from './journeys/browser.ts'
import { startSurface, stopSurface } from './journeys/surface.ts'
import { SERVICE_PREFIXES } from '../src/lib/routes.ts'

/** A session in storage, so the gate lets the page render and the client attaches a bearer. */
const SIGNED_IN = { 'cf.accessToken': 'test-access', 'cf.refreshToken': 'test-refresh' }

/* ══════════════════════════════════════════════════════════════════════════════════════════════
 * THE PORTAL, STANDING IN — AND THE SEAM THESE SCENARIOS EXIST FOR
 *
 * Every scenario here that wanted a signed-in operator did it by seeding `SIGNED_IN` into
 * `localStorage`, and that is the shape of a test that cannot fail: **nothing in this estate ever
 * puts a token into THIS origin's storage except `bootstrapSession` redeeming a `#cf_code`**, and
 * until the commit these scenarios arrived with, nothing ever sent this surface a `#cf_code`.
 *
 * The estate's tokens are per-origin `localStorage` and there are NO cookies anywhere in it —
 * measured, in a real browser against the running estate: after signing in at
 * `hub.<apex>/account/login` the context held `['cf.accessToken', 'cf.refreshToken']` on Hub's
 * origin and `[]` on Beacon's, with `context.cookies()` empty for every host. So an operator who
 * is signed into the estate is, as far as this origin can see, a stranger — which is what
 * `micro-ui`'s `pnpm footer-audit` reported the moment it started signing in for `adminOnly`
 * surfaces rather than only for ones that redirect: `hides "Admin" from a signed-in operator`,
 * four times over, on a footer rendering the identical 18 links signed-out and signed-in.
 *
 * The one bridge across an origin is the portal hand-off (`@cloudsforge/ui`: `signInRedirect`,
 * then `consumeAuthCallback` redeeming at `POST /auth/handoff/redeem`), and `admin-web` has always
 * crossed it — `ProtectedRoute` (admin-web/src/lib/auth.tsx:202-215) sends an anonymous visitor to
 * the portal, which hands a held session straight back (hub-web/src/pages/account.tsx:220-236)
 * without a second credential prompt. This surface never asked.
 *
 * So the stand-in below is the PORTAL, not this app: it answers `GET /account/login` and either
 * holds a session — bouncing back with a code, as Hub does — or does not. What is under test is
 * whether this bundle ASKS, what return address it asks with, and that it asks once.
 * ══════════════════════════════════════════════════════════════════════════════════════════════ */

/** The code Hub would put in the fragment. Redeemed once, for tokens, by `consumeAuthCallback`. */
const HANDOFF_CODE = 'test-handoff-code-0001'

/** Chromium asks the portal's origin for one, and an unanswered request is a failed request. */
const PORTAL_FAVICON: Stubs[number] = ['GET /favicon.ico', { status: 204, body: '' }]

/** Where the browser was sent to sign in, and what return address it carried. */
function portalCalls(session: Session): SentRequest[] {
  return session.apiCalls().filter((r) => new URL(r.url).pathname === '/account/login')
}

/**
 * The portal, with or without a session of its own.
 *
 * With one it does what Hub does: mints a code and returns the browser to the address it was given,
 * with the code in the FRAGMENT. Without one it renders its sign-in form and the browser stays
 * there — which is the whole reason this surface may only ask once.
 */
function portal(holdsASession: boolean): Stubs[number] {
  return [
    'GET /account/login',
    (req: SentRequest) => {
      const back = new URL(req.url).searchParams.get('return')
      if (back === null) return { status: 400, body: 'the console did not say where to return to' }
      if (!holdsASession) {
        return { contentType: 'text/html', body: '<!doctype html><title>Sign in</title><h1>Sign in</h1>' }
      }
      const url = new URL(back)
      const params = new URLSearchParams(url.hash.replace(/^#/, ''))
      params.set('cf_code', HANDOFF_CODE)
      url.hash = params.toString()
      return {
        contentType: 'text/html',
        body: `<!doctype html><title>Signing you in</title><meta http-equiv="refresh" content="0;url=${url.toString()}">`,
      }
    },
  ]
}

/** Identity redeeming the code, once, for this origin's own tokens. */
const REDEEM: Stubs[number] = [
  'POST /auth/handoff/redeem',
  { json: { accessToken: 'handed-access', refreshToken: 'handed-refresh', expiresIn: 900 } },
]

const ME: Stubs[number] = ['GET /auth/me', { json: { user: { handle: 'estateadmin', roles: ['admin'] } } }]

/** The body Beacon really returned for `probe-1`, captured with curl against the running estate. */
const REFUSAL = {
  release: 'probe-1',
  decision: 'refuse',
  promote: false,
  indeterminate: true,
  reasons: [
    { code: 'journey_skipped', subject: 'identity.signin', detail: 'the most recent run was a skip', determinacy: 'known' },
    { code: 'conformance_never_run', subject: 'conformance', detail: 'no conformance run has been recorded', determinacy: 'unknown' },
    { code: 'incident_open', subject: 'identity.signin', detail: 'SEV2 open since 2026-08-03T21:23:47.237Z', determinacy: 'known' },
  ],
  waived: [],
}

/** The live answer from `GET /v1/slos`. Verified with curl: `{"slos":[],"budgets":[]}`. */
const NO_OBJECTIVES = { slos: [], budgets: [] }

const READS: Stubs = [
  ME,
  ['GET /v1/gate', { json: REFUSAL }],
  ['GET /v1/gate/history', { json: { release: 'probe-1', decisions: [] } }],
  ['GET /v1/slos', { json: NO_OBJECTIVES }],
]

after(async () => {
  await closeBrowser()
  await stopSurface()
})

describe('the estate sign-on this console is part of', () => {
  it('asks the portal whether the reader already holds a session — once, and no more', async () => {
    const surface = await startSurface()
    const session = await renderOnlyWithStubbedNetwork(surface.origin, {
      path: '/',
      stubs: [portal(false), PORTAL_FAVICON],
      apiPrefixes: SERVICE_PREFIXES,
    })
    try {
      // ASKED. The bundle has no way of its own to know: the estate's tokens are per-origin
      // storage and it holds none, so the only reader it can distinguish from a stranger is one
      // the portal has already told it about.
      const asked = portalCalls(session)
      assert.equal(asked.length, 1, `the portal was asked ${asked.length} times; expected once`)

      // WITH THE ADDRESS THIS PAGE IS AT. A return address to anywhere else is how an operator
      // signs in and lands on somebody else's surface.
      const back = new URL(asked[0]?.url ?? '').searchParams.get('return')
      assert.equal(back, `${surface.origin}/`)

      // AND ONCE. The portal holds no session in this scenario, so it kept the browser; a reader
      // who comes back must get this console rather than be sent round again.
      await session.page.goto(`${surface.origin}/`, { waitUntil: 'domcontentloaded' })
      await assertMounted(session, { showing: ['Beacon is an operator surface'] })
      assert.equal(
        portalCalls(session).length,
        1,
        'asked the portal a second time — a reader who declined to sign in is now in a loop',
      )
    } finally {
      await session.close()
    }
  })

  it('takes the hand-off when the portal holds one, and asks for no second credential', async () => {
    const surface = await startSurface()
    const session = await renderOnlyWithStubbedNetwork(surface.origin, {
      path: '/?release=probe-1',
      stubs: [portal(true), REDEEM, PORTAL_FAVICON, ...READS],
      apiPrefixes: SERVICE_PREFIXES,
    })
    try {
      // The operator is on the console, signed in, having typed nothing. This is the journey the
      // footer defect was the visible half of.
      await assertMounted(session, { showing: ['estateadmin'] })
      assert.equal(session.page.url(), `${surface.origin}/?release=probe-1`)

      // The code was spent at identity's redemption route and is NOT in the address bar. Both
      // halves matter: a code left in the fragment is a credential in the history.
      const redeemed = session
        .apiCalls()
        .filter((r) => new URL(r.url).pathname === '/auth/handoff/redeem')
      assert.equal(redeemed.length, 1, `redeemed ${redeemed.length} times; expected once`)
      assert.equal(JSON.parse(redeemed[0]?.body ?? '{}').code, HANDOFF_CODE)
      assert.doesNotMatch(session.page.url(), /cf_code/)

      // And the tokens are this origin's own, from the redemption — not the portal's.
      const stored = await session.page.evaluate(() => ({
        access: localStorage.getItem('cf.accessToken'),
        refresh: localStorage.getItem('cf.refreshToken'),
      }))
      assert.deepEqual(stored, { access: 'handed-access', refresh: 'handed-refresh' })
    } finally {
      await session.close()
    }
  })

  it('does not send an operator who already holds a session to the portal at all', async () => {
    const surface = await startSurface()
    const session = await renderOnlyWithStubbedNetwork(surface.origin, {
      path: '/?release=probe-1',
      storage: SIGNED_IN,
      // The portal is in the table and must go UNUSED. Left out, an unwanted trip to it would be
      // an aborted request rather than a legible failure.
      stubs: [portal(true), REDEEM, PORTAL_FAVICON, ...READS],
      apiPrefixes: SERVICE_PREFIXES,
    })
    try {
      await assertMounted(session, { showing: ['estateadmin'] })
      assert.deepEqual(
        portalCalls(session).map((r) => r.url),
        [],
        'a reader holding a session was sent to sign in again',
      )
    } finally {
      await session.close()
    }
  })
})

describe('the operator console renders', () => {
  it('shows a signed-out visitor a sign-in path and makes NO API request at all', async () => {
    const surface = await startSurface()
    const session = await renderOnlyWithStubbedNetwork(surface.origin, {
      path: '/?release=probe-1',
      stubs: [portal(false), PORTAL_FAVICON],
      apiPrefixes: SERVICE_PREFIXES,
    })
    try {
      // The signed-out screen is what a reader gets once the portal has been asked and had nothing
      // to give. Reached by coming back rather than by seeding a flag, so this scenario stands on
      // the one-shot behaviour pinned above rather than on a private arrangement with it.
      await session.page.goto(`${surface.origin}/?release=probe-1`, { waitUntil: 'domcontentloaded' })
      const text = await assertMounted(session, {
        showing: ['Beacon is an operator surface', 'Sign in'],
      })
      // The property that matters, and it is asserted on what the browser SENT rather than on
      // what the screen says. A gate that rendered the page and let the panels fetch would show
      // an operator six 401 panels with a sign-in button underneath them.
      //
      // Read from `collected.requests` and NOT from `apiCalls()`: this bundle's reads are
      // SAME-ORIGIN by design, and `apiCalls()` filters those out as the surface's own assets.
      // Using it here would have made this assertion pass without measuring anything.
      const beaconCalls = session.collected.requests.filter((r) =>
        new URL(r.url).pathname.startsWith('/v1'),
      )
      assert.deepEqual(beaconCalls, [], 'a signed-out visitor issued a Beacon request')
      // No VERDICT word. Not a ban on the stem "refuse" — the panel legitimately says that if
      // Beacon refuses your account the page will show Beacon's own code, which is the sentence
      // that stops this screen being read as a guess.
      for (const verdict of ['Refused', 'May be promoted', 'nobody knows']) {
        assert.ok(!text.includes(verdict), `the signed-out screen implies a verdict: ${verdict}`)
      }
    } finally {
      await session.close()
    }
  })

  it('renders a refusal as a verdict — three channels, and NOT in the surface accent', async () => {
    const surface = await startSurface()
    const session = await renderOnlyWithStubbedNetwork(surface.origin, {
      path: '/?release=probe-1',
      storage: SIGNED_IN,
      stubs: READS,
      apiPrefixes: SERVICE_PREFIXES,
    })
    try {
      await assertMounted(session, {
        showing: [
          'Refused — nobody knows',
          'We could not find out — which is worse',
          'We looked, and it is bad',
          'conformance_never_run',
        ],
      })
      const badge = await session.page.evaluate(() => {
        const el = document.querySelector('.bw-badge--hero')
        if (!el) return null
        const style = getComputedStyle(el)
        const accent = getComputedStyle(document.documentElement).getPropertyValue('--cf-accent').trim()
        return { className: el.className, colour: style.color, accent, word: el.textContent ?? '' }
      })
      assert.ok(badge, 'the hero verdict badge did not render')
      // The accent block really loaded — otherwise the assertion below would pass vacuously
      // against an unstyled page, which is how three surfaces in this estate shipped.
      assert.match(badge.accent, /^#[0-9a-f]{6}$/i, `--cf-accent did not resolve: "${badge.accent}"`)
      assert.equal(badge.className.includes('bw-badge--clear'), false)
      // Channel one: the word. Channel two: the glyph. Channel three: the tone class.
      assert.match(badge.word, /Refused/)
      assert.match(badge.word, /\?/)
      assert.ok(badge.className.includes('bw-badge--unknown'))
    } finally {
      await session.close()
    }
  })

  it('says on the GATE page that the verdict carries no error-budget signal', async () => {
    const surface = await startSurface()
    const session = await renderOnlyWithStubbedNetwork(surface.origin, {
      path: '/?release=probe-1',
      storage: SIGNED_IN,
      stubs: READS,
      apiPrefixes: SERVICE_PREFIXES,
    })
    try {
      const text = await assertMounted(session, {
        showing: ['NOT CHECKING ERROR BUDGETS AT ALL', 'no error-budget signal'],
      })
      // The whole reason the requirement exists: the gate's silence about budgets is
      // indistinguishable from a clean pass, so the caveat has to live beside the verdict and not
      // only on the page nobody opens.
      assert.ok(text.indexOf('NOT CHECKING ERROR BUDGETS') < text.indexOf('Recorded decisions'))
    } finally {
      await session.close()
    }
  })

  it('renders the empty objectives table as an absence, with no figure anywhere on the page', async () => {
    const surface = await startSurface()
    const session = await renderOnlyWithStubbedNetwork(surface.origin, {
      path: '/objectives',
      storage: SIGNED_IN,
      stubs: [ME, ['GET /v1/slos', { json: NO_OBJECTIVES }]],
      apiPrefixes: SERVICE_PREFIXES,
    })
    try {
      const text = await assertMounted(session, { showing: ['No objectives defined'] })
      // Read off the rendered DOM rather than off the model, because this is the layer where a
      // component could have added a figure the pure function never produced.
      const panel = await session.page.evaluate(
        () => document.querySelector('.bw-noobjectives')?.textContent ?? '',
      )
      assert.ok(panel.length > 200, 'the no-objectives panel did not render')
      assert.doesNotMatch(panel, /\b100\b|\d+\s*%/, 'the panel renders a figure')
      assert.doesNotMatch(panel, /\b(ok|healthy|good|nominal|no problems)\b/i)
      assert.doesNotMatch(text, /Error budgets: /)
    } finally {
      await session.close()
    }
  })

  it('distinguishes an unreachable Beacon from a refusal', async () => {
    const surface = await startSurface()
    const session = await renderOnlyWithStubbedNetwork(surface.origin, {
      path: '/?release=probe-1',
      storage: SIGNED_IN,
      // `abort` answers nothing at all, as a service that is not there does.
      stubs: [ME, ['GET /v1/gate', { abort: true }], ['GET /v1/gate/history', { abort: true }], ['GET /v1/slos', { abort: true }]],
      apiPrefixes: SERVICE_PREFIXES,
    })
    try {
      const text = await assertMounted(session, {
        showing: ['The gate was never asked', 'This is not a refusal'],
        // Chromium logs a refused connection to the console, and this scenario arranged all four.
        tolerate: [/Failed to load resource/],
        tolerateFailures: [/\/v1\//, /\/auth\/me/],
      })
      // The two facts must not be readable as each other, in either direction.
      assert.doesNotMatch(text, /Refused — nobody knows/)
      assert.match(text, /Do not read this screen as a block and do not read it as a pass/)
    } finally {
      await session.close()
    }
  })
})

/* ══════════════════════════════════════════════════════════════════════════════════════════════
 * THE FOOTER, IN THE STATE A VISITOR ACTUALLY REACHES
 *
 * `micro-ui`'s `pnpm footer-audit` is the guard that owns this property estate-wide, and it found
 * this surface rendering NO footer landmark at all while sixteen other surfaces were already
 * offering links to it. It is also a check that DOES NOT RUN IN CI — it needs the whole estate up
 * behind the gateway and its CA — so the defect survived every green pipeline this repository has
 * ever had.
 *
 * These two scenarios are the half of that guard which CAN run here: this bundle, built, in real
 * Chromium, on every push. They cannot answer reachability (nothing in this file can — see the
 * header) and they are not a replacement for the audit. They are the tripwire that would have gone
 * red the day the footer was left out.
 *
 * THE EXPECTATIONS ARE DERIVED FROM `SURFACES`, NOT LISTED HERE. A hand-written list of sixteen
 * names would pass forever after a seventeenth surface was added, which is the failure mode the
 * shared footer exists to prevent in the first place.
 * ══════════════════════════════════════════════════════════════════════════════════════════════ */

/** Every surface the footer must offer a signed-out reader. The audit's rule, restated. */
const PUBLIC_SURFACE_NAMES = SURFACES.filter(
  (s) => s.servesUi && s.key !== 'signin' && s.adminOnly !== true,
).map((s) => s.name)

/** The four the footer must NOT offer one. Hiding is not the boundary; advertising is the defect. */
const OPERATOR_SURFACE_NAMES = SURFACES.filter((s) => s.servesUi && s.adminOnly === true).map(
  (s) => s.name,
)

const READ_FOOTER = function () {
  const foots = Array.from(document.querySelectorAll('footer, [role="contentinfo"]'))
  const foot = foots[0] as HTMLElement | undefined
  const navs = foot ? Array.from(foot.querySelectorAll('nav')) : []
  const anchors = foot ? Array.from(foot.querySelectorAll('a')) : []
  return {
    landmarks: foots.length,
    // `.cf-foot` is CloudsForgeFooter's own class and @cloudsforge/ui is the only thing that emits
    // it. This is what separates "has a footer" from "has THE footer": a local imitation would
    // satisfy every other assertion in this file and is exactly what must not happen.
    shared: Boolean(document.querySelector('footer.cf-foot')),
    role: foot?.getAttribute('role') ?? '',
    labelled: navs.filter((n) => n.getAttribute('aria-labelledby') ?? n.getAttribute('aria-label'))
      .length,
    unlabelled: navs.filter(
      (n) => !(n.getAttribute('aria-labelledby') ?? n.getAttribute('aria-label')),
    ).length,
    headings: Array.from(foot?.querySelectorAll('h2') ?? []).map((h) => (h.textContent ?? '').trim()),
    links: anchors.map((a) => ({
      text: (a.textContent ?? '').trim(),
      href: a.getAttribute('href') ?? '',
      current: a.getAttribute('aria-current') === 'page',
    })),
    background: foot ? getComputedStyle(foot).backgroundColor : '',
    text: foot?.innerText ?? '',
    // The PAGE's substrate, not the footer's. Two different questions, and only one was ever
    // asked: the footer brings its own background from @cloudsforge/ui, so it looked right on a
    // page whose body had no background at all. See the block this checks, in src/styles.css.
    pageBackground: getComputedStyle(document.body).backgroundColor,
    bgToken: getComputedStyle(document.documentElement).getPropertyValue('--cf-bg').trim(),
  }
}

/** `#0e0c0a` → `rgb(14, 12, 10)`, so the token and the computed value can be compared exactly. */
function asRgb(hex: string): string {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  assert.ok(m, `--cf-bg did not resolve to a six-digit hex: ${JSON.stringify(hex)}`)
  return `rgb(${parseInt(m[1] as string, 16)}, ${parseInt(m[2] as string, 16)}, ${parseInt(m[3] as string, 16)})`
}

describe('the estate footer', () => {
  it('is under the sign-in panel BEFORE anybody signs in, and hides the operator surfaces', async () => {
    const surface = await startSurface()
    const session = await renderOnlyWithStubbedNetwork(surface.origin, {
      path: '/?release=probe-1',
      stubs: [portal(false), PORTAL_FAVICON],
      apiPrefixes: SERVICE_PREFIXES,
    })
    try {
      // The panel is what a reader gets once the portal has been asked and had nothing to give;
      // see the one-shot scenario above, which this comes back from rather than seeding a flag.
      await session.page.goto(`${surface.origin}/?release=probe-1`, { waitUntil: 'domcontentloaded' })
      await assertMounted(session, { showing: ['Beacon is an operator surface'] })
      const f = await session.page.evaluate(READ_FOOTER)

      // The landmark, and that it is the SHARED one.
      assert.equal(f.shared, true, 'the page does not render @cloudsforge/ui’s CloudsForgeFooter')
      assert.equal(f.landmarks, 1, `${f.landmarks} footer landmarks; there must be exactly one`)
      assert.equal(f.role, 'contentinfo')

      // It is navigation, and navigation is labelled.
      assert.equal(f.unlabelled, 0, 'an unlabelled <nav> inside the footer')
      assert.equal(f.labelled, 4)
      assert.equal(f.headings.length, 4)

      // The links are the registry's. Derived, so a new surface is covered the day its row lands.
      const texts = f.links.map((l) => l.text)
      for (const name of PUBLIC_SURFACE_NAMES) {
        assert.ok(texts.includes(name), `the footer does not offer "${name}"`)
      }
      for (const name of OPERATOR_SURFACE_NAMES) {
        assert.ok(!texts.includes(name), `advertises the operator surface "${name}" to a stranger`)
      }
      for (const link of f.links) {
        assert.notEqual(link.text, '', `a link with no text at ${link.href}`)
        assert.notEqual(link.href, '', `"${link.text}" is an anchor with no href`)
      }

      // Nothing is marked current: this surface is adminOnly, so its own link is not on the page
      // for a stranger to be standing on. The identity line still says where they are.
      assert.deepEqual(f.links.filter((l) => l.current), [])
      assert.match(f.text, /Beacon — Status & uptime/)
      assert.match(f.text, /same hostname as the service it reads/)

      // The stylesheet reached the page. A footer whose markup is perfect and whose CSS never
      // arrived is not a footer anybody can read — three surfaces in this estate shipped that way.
      assert.notEqual(f.background, 'rgba(0, 0, 0, 0)', 'the footer’s CSS never arrived')
      assert.notEqual(f.background, '')

      // AND THE PAGE UNDER IT. This surface shipped with no `body` background rule at all, so the
      // token resolved, the footer was dark, and everything between the sub-nav and the footer was
      // white. Asserted against the TOKEN rather than a colour written here, so re-theming the
      // estate does not make this fail and hard-coding a value cannot make it pass.
      assert.equal(
        f.pageBackground,
        asRgb(f.bgToken),
        'the page body does not consume --cf-bg; the surface renders on a white substrate',
      )
    } finally {
      await session.close()
    }
  })

  /**
   * The operator's footer, reached the way an operator reaches it: through the portal.
   *
   * This scenario used to seed `SIGNED_IN` into `localStorage`, and that made it a check that
   * could not fail — it arranged the one thing the bundle could not do for itself and then
   * asserted the consequence. It is now driven from a signed-out browser through the hand-off,
   * which is the seam the estate audit exercises.
   */
  it('marks Beacon as the current surface for an operator, and offers the other three', async () => {
    const surface = await startSurface()
    const session = await renderOnlyWithStubbedNetwork(surface.origin, {
      path: '/?release=probe-1',
      stubs: [portal(true), REDEEM, PORTAL_FAVICON, ...READS],
      apiPrefixes: SERVICE_PREFIXES,
    })
    try {
      await assertMounted(session)
      const f = await session.page.evaluate(READ_FOOTER)
      assert.equal(f.shared, true)

      const texts = f.links.map((l) => l.text)
      // The inverse of the assertion above, so "hidden from everybody" cannot pass as "hidden from
      // strangers". A rule that only ever removes things is satisfied by removing everything.
      for (const name of [...PUBLIC_SURFACE_NAMES, ...OPERATOR_SURFACE_NAMES]) {
        assert.ok(texts.includes(name), `hides "${name}" from a signed-in operator`)
      }

      const marked = f.links.filter((l) => l.current)
      assert.equal(marked.length, 1, `${marked.length} links marked aria-current; expected one`)
      assert.equal(marked[0]?.text, 'Beacon')
    } finally {
      await session.close()
    }
  })
})

describe('the addresses this console serves', () => {
  it('serves every declared route, and 404s a child of one', async () => {
    const surface = await startSurface()
    assert.equal((await surface.fetchStatus('/objectives')).status, 200)
    assert.equal((await surface.fetchStatus('/objectives/deeper')).status, 404)
    assert.equal((await surface.fetchStatus('/nope')).status, 404)
    // The shell is still served under the 404, so React renders NotFoundPage inside it.
    assert.match((await surface.fetchStatus('/nope')).type, /text\/html/)
  })

  it('refuses Beacon’s own paths with a sentence naming the missing gateway rule', async () => {
    const surface = await startSurface()
    const answer = await surface.fetchStatus('/v1/gate')
    assert.equal(answer.status, 404)
    assert.match(answer.type, /text\/plain/)
    assert.match(answer.body, /belongs to micro-beacon/)
  })

  it('refuses every crawler at /robots.txt and has no sitemap to give', async () => {
    /*
     * Driven rather than read. `test/sitemap.test.ts` compares the body in nginx.conf with what
     * `robotsTxt()` generates, which proves the CONFIG is right; this proves the config is also
     * REACHED — that `location = /robots.txt` wins over the `location /` prefix that serves the
     * static tree, and that `location = /sitemap.xml` produces a 404 rather than a document.
     *
     * The expectation is the same generated string, not a second copy of it.
     */
    const surface = await startSurface()
    const robots = await surface.fetchStatus('/robots.txt')
    assert.equal(robots.status, 200)
    assert.match(robots.type, /text\/plain/)
    assert.equal(robots.body, robotsTxt({ indexable: false }))

    // 404, and the app shell under it — the same answer as any other address this surface does not
    // serve, which is what makes the absence indistinguishable from an address that never existed.
    const sitemap = await surface.fetchStatus('/sitemap.xml')
    assert.equal(sitemap.status, 404)
    assert.match(sitemap.type, /text\/html/)
  })
})

/* ══════════════════════════════════════════════════════════════════════════════════════════════
 * THE 1.1 SHELL, DRIVEN RATHER THAN READ
 *
 * Every assertion in this block is about something a stylesheet grep or a config parse cannot
 * answer: where focus goes, what the tab order is, what the head says AFTER a client-side
 * navigation, and what the browser was asked to fetch. The skip link is the sharpest case — this
 * surface HAD one, it pointed at a real element, and it did not work, because the element was not
 * focusable. Nothing that reads source could have told the difference.
 * ══════════════════════════════════════════════════════════════════════════════════════════════ */

describe('the shell a keyboard reader meets', () => {
  it('puts the skip link first in the tab order and lands focus inside the main landmark', async () => {
    const surface = await startSurface()
    const session = await renderOnlyWithStubbedNetwork(surface.origin, {
      path: '/?release=probe-1',
      stubs: [portal(false), PORTAL_FAVICON],
      apiPrefixes: SERVICE_PREFIXES,
    })
    try {
      await session.page.goto(`${surface.origin}/?release=probe-1`, { waitUntil: 'domcontentloaded' })
      await assertMounted(session, { showing: ['Beacon is an operator surface'] })

      // Tab once from the top: the skip link, visible, pointing at the landmark that exists.
      await assertSkipLink(session.page, 'the signed-out console')

      /*
       * AND THE HALF THAT WAS BROKEN. Following the link must MOVE FOCUS, not merely scroll. The
       * old `<main id="main">` carried no `tabIndex={-1}`, so Chrome scrolled the page, left focus
       * on the link, and sent the next Tab back into the company bar — a reader looking at the
       * content while tabbing through the chrome they had just asked to skip.
       *
       * Read as "is the active element the main region, or inside it", because a browser is
       * entitled to move focus to the target itself and this asserts the outcome rather than one
       * implementation of it.
       */
      await session.page.keyboard.press('Enter')
      const landed = await session.page.evaluate((id: string) => {
        const main = document.getElementById(id)
        const active = document.activeElement
        return {
          exists: Boolean(main),
          focusable: main?.getAttribute('tabindex'),
          inside: Boolean(main && active && (active === main || main.contains(active))),
        }
      }, MAIN_ID)
      assert.equal(landed.exists, true, `there is no #${MAIN_ID} on the page`)
      assert.equal(landed.focusable, '-1', 'the main landmark is not focusable, so the link only scrolls')
      assert.equal(landed.inside, true, 'following the skip link left focus outside the main region')
    } finally {
      await session.close()
    }
  })

  it('has exactly one main landmark and no skipped heading level', async () => {
    const surface = await startSurface()
    const session = await renderOnlyWithStubbedNetwork(surface.origin, {
      path: '/?release=probe-1',
      stubs: [portal(true), REDEEM, PORTAL_FAVICON, ...READS],
      apiPrefixes: SERVICE_PREFIXES,
    })
    try {
      // Signed in, so the gate page is what is measured rather than the sign-in panel — that is
      // the page with the deepest heading tree on this surface.
      await assertMounted(session, { showing: ['estateadmin'] })
      await assertLandmarks(session.page, 'the release gate')
    } finally {
      await session.close()
    }
  })
})

describe('the head follows the address', () => {
  it('retitles the document on a client-side navigation, from the ROUTES table', async () => {
    const surface = await startSurface()
    const session = await renderOnlyWithStubbedNetwork(surface.origin, {
      path: '/?release=probe-1',
      stubs: [portal(true), REDEEM, PORTAL_FAVICON, ...READS, ['GET /v1/journeys', { json: { journeys: [] } }]],
      apiPrefixes: SERVICE_PREFIXES,
    })
    try {
      await assertMounted(session, { showing: ['estateadmin'] })

      /*
       * The index, titled from its own `ROUTES` label rather than from the surface name alone —
       * `Release gate — Beacon`, which is also what index.html now states statically. Composed
       * here rather than typed, so this scenario cannot be the thing that goes stale.
       */
      assert.equal(await session.page.title(), surfaceMeta('beacon', { title: 'Release gate' }).title)

      /*
       * A CLIENT-SIDE navigation, through the sub-navigation, which is the only kind that can go
       * wrong here: a full page load re-reads index.html and would be titled correctly by the
       * static tag alone. `DocumentMeta` is driven by `useLocation()`, so this is the assertion
       * that it is mounted in the shell rather than in a page that remembered to call it.
       */
      await session.page.click('.bw-subnav__link[href="/journeys"]')
      await session.page.waitForFunction(() => document.title.startsWith('Journeys'), undefined, {
        timeout: 5_000,
      })
      assert.equal(session.page.url(), `${surface.origin}/journeys`)
      assert.equal(await session.page.title(), surfaceMeta('beacon', { title: 'Journeys' }).title)

      // The canonical moved with it, and there is exactly one of it. `applyHead` updates tags IN
      // PLACE; the bug every hand-rolled version of this has is appending, which leaves the
      // previous page's canonical first in the head and therefore the one that wins.
      const head = await session.page.evaluate(() => ({
        canonicals: [...document.querySelectorAll('link[rel="canonical"]')].map((l) =>
          l.getAttribute('href'),
        ),
        robots: [...document.querySelectorAll('meta[name="robots"]')].map((m) =>
          m.getAttribute('content'),
        ),
        lang: document.documentElement.lang,
      }))
      assert.deepEqual(head.canonicals, [`${surface.origin}/journeys`])

      /*
       * ONE robots tag, carrying the DERIVED directive. Two would be the real risk: index.html
       * states `noindex, nofollow` statically and `applyHead` writes the same name, so an
       * implementation that appended rather than updated would leave a stale first tag — and the
       * first matching tag is the one a crawler obeys, which is how a page ends up indexed while
       * every layer of its own source says it should not be.
       */
      assert.deepEqual(head.robots, [surfaceMeta('beacon').robots])
      assert.equal(head.robots[0], 'noindex, nofollow')
      assert.equal(head.lang, 'en-GB')
    } finally {
      await session.close()
    }
  })
})

describe('consent, on a surface that measures nothing', () => {
  it('sets no cookie, fetches nothing third-party, and draws no banner', async () => {
    /*
     * THE THREE THINGS THAT MUST BE TRUE ON LOAD, and the reason `initAnalytics()` is called on a
     * surface with no measurement ID. Under ePrivacy Art. 5(3) a cookie set before consent is a
     * violation that a banner underneath it does not cure, so "no cookie yet" is not a detail of
     * the implementation — it is the requirement.
     *
     * The banner's absence is the second half and is deliberate rather than a gap: `CookieBanner`
     * is mounted in the shell and returns null because `analyticsId()` finds no
     * `<meta name="cf-analytics">`. Mounting a component that renders nothing keeps this shell the
     * same shape as every other surface's, so the gate is already in front of the tag on the day
     * somebody adds one.
     */
    const surface = await startSurface()
    const session = await renderOnlyWithStubbedNetwork(surface.origin, {
      path: '/?release=probe-1',
      stubs: [portal(true), REDEEM, PORTAL_FAVICON, ...READS],
      apiPrefixes: SERVICE_PREFIXES,
    })
    try {
      await assertMounted(session, { showing: ['estateadmin'] })

      assert.deepEqual(await session.context.cookies(), [], 'something set a cookie before consent')

      // Nothing was even ASKED for from a measurement host. Assembled so this assertion does not
      // match its own explanation, and checked over every request the page sent.
      const tagHost = ['googletagmanager', '.com'].join('')
      const offOrigin = session
        .apiCalls()
        .map((r) => r.url)
        .filter((url) => url.includes(tagHost) || url.includes('google-analytics'))
      assert.deepEqual(offOrigin, [], 'the page fetched an analytics script')

      // And the banner is not on the page, because there is nothing to consent to.
      const banner = await session.page.evaluate(() => document.querySelectorAll('.cf-consent').length)
      assert.equal(banner, 0, 'a consent banner was drawn on a surface that measures nothing')
    } finally {
      await session.close()
    }
  })
})
