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
import { assertMounted, closeBrowser, renderOnlyWithStubbedNetwork, type Stubs } from './journeys/browser.ts'
import { startSurface, stopSurface } from './journeys/surface.ts'
import { SERVICE_PREFIXES } from '../src/lib/routes.ts'

/** A session in storage, so the gate lets the page render and the client attaches a bearer. */
const SIGNED_IN = { 'cf.accessToken': 'test-access', 'cf.refreshToken': 'test-refresh' }

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

describe('the operator console renders', () => {
  it('shows a signed-out visitor a sign-in path and makes NO API request at all', async () => {
    const surface = await startSurface()
    const session = await renderOnlyWithStubbedNetwork(surface.origin, { path: '/?release=probe-1', apiPrefixes: SERVICE_PREFIXES })
    try {
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
})
