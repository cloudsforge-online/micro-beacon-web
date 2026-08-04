/**
 * The three descriptions of this app's addresses must agree.
 *
 *   1. `src/lib/routes.ts` — the declaration the navigation is derived from,
 *   2. `src/app.tsx`       — which component renders at each path,
 *   3. `nginx.conf`        — which addresses are served the shell at all.
 *
 * The third is the one that bites, and it bites late: nginx enumerates the real routes and 404s
 * everything else on purpose, so an app that answers 200 for every address serves its
 * "page not found" screen as a success. "Remember to update nginx.conf" is not a mechanism.
 *
 * This file also guards two things specific to this surface: that no route is left ungated, and
 * that the service's own path prefixes are refused by this container rather than swallowed by the
 * SPA fallback.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import { DEEP_LINK_PATH, NAV, NON_INDEX_PATHS, ROUTES, SERVICE_PREFIXES } from '../src/lib/routes.ts'

const root = fileURLToPath(new URL('..', import.meta.url))
const nginx = readFileSync(join(root, 'nginx.conf'), 'utf8')
/** Comments stripped, because this file quotes the directives it forbids while explaining them. */
const effective = nginx.replace(/#.*/g, '')
const app = readFileSync(join(root, 'src', 'app.tsx'), 'utf8')

describe('nginx serves exactly the routes this app declares', () => {
  it('enumerates every non-index route in one alternation', () => {
    const block = /location ~ \^\/\(([^)]*)\)\/\?\$/.exec(effective)
    assert.ok(block, 'the enumerated client-route location is missing from nginx.conf')
    assert.deepEqual((block[1] ?? '').split('|').sort(), [...NON_INDEX_PATHS].sort())
  })

  it('uses `/?$` for every client route and never `(/|$)`, so a child path still 404s', () => {
    // `(/|$)` is a PREFIX: it would match /journeys/anything/at/all, which the router does not
    // own — so the not-found page would be served with a 200. `site`'s nginx.conf records the
    // same defect, found by probing a running image rather than by reading the file.
    //
    // The service-prefix location DOES use `(/|$)`, correctly and deliberately: `/v1/gate` is a
    // path BENEATH `/v1` and a prefix is exactly what is wanted there. So this check names the
    // client routes rather than banning the operator outright — the first version of it banned the
    // operator and went red against a config that was right, which is a guard that teaches people
    // to delete the guard.
    for (const [, alternation] of effective.matchAll(/location ~ \^\/\(([^)]*)\)\(\/\|\$\)/g)) {
      const named = (alternation ?? '').split('|')
      for (const path of NON_INDEX_PATHS) {
        assert.equal(named.includes(path), false, `/${path} is matched as a prefix, so /${path}/x would answer 200`)
      }
    }
  })

  it('serves the index explicitly', () => {
    assert.match(effective, /location = \/ \{/)
  })

  it('keeps the honest 404 and never uses the blanket SPA fallback', () => {
    assert.doesNotMatch(effective, /try_files\s+\$uri\s+(\$uri\/\s+)?\/index\.html/)
    assert.match(effective, /error_page 404 \/index\.html/)
  })

  it('restates the security headers in every location that sets a header', () => {
    // nginx's `add_header` is all-or-nothing per level: a location declaring ANY add_header
    // inherits NONE from its parent. Reading the file suggests inheritance; curling it does not.
    const blocks = [...effective.matchAll(/location[^{]*\{([\s\S]*?)\n    \}/g)].map((m) => m[1] ?? '')
    const withHeaders = blocks.filter((body) => body.includes('add_header'))
    assert.ok(withHeaders.length >= 4)
    for (const body of withHeaders) {
      for (const header of ['X-Content-Type-Options', 'X-Frame-Options', 'Referrer-Policy']) {
        assert.ok(body.includes(header), `a location sets headers but omits ${header}`)
      }
    }
  })
})

describe('nginx refuses the service’s own paths rather than swallowing them', () => {
  it('names every service prefix', () => {
    const block = /location ~ \^\/\(([^)]*)\)\(\/\|\$\) \{/.exec(effective)
    assert.ok(block, 'the service-prefix location is missing from nginx.conf')
    assert.deepEqual((block[1] ?? '').split('|').sort(), [...SERVICE_PREFIXES].sort())
  })

  it('answers them with a plain 404 that names the missing gateway rule', () => {
    // `return 404 <text>` answers directly and does NOT re-enter `error_page`, so `/v1/gate`
    // cannot render the operator console at an API address. In production this bundle and Beacon
    // share `beacon.<apex>`, and today the gateway routes the whole host to the API — see the
    // README, "What deploy has to do".
    assert.match(effective, /return 404 "This container serves the beacon-web bundle only/)
    assert.match(effective, /estate-web\.yml/)
  })
})

describe('the route table in app.tsx matches the declaration', () => {
  it('declares a component for every non-index route', () => {
    for (const path of NON_INDEX_PATHS) {
      assert.match(app, new RegExp(`path="${path}"`), `src/app.tsx has no route for /${path}`)
    }
  })

  it('has an index route and a catch-all', () => {
    assert.match(app, /<Route\s+index/)
    assert.match(app, /path="\*"/)
  })

  it('gates every declared route and leaves the catch-all ungated', () => {
    // Every read is authenticated and `beacon` is adminOnly, so a page that rendered without a
    // session would be a page made of 401s. The 404 page is deliberately outside: an operator who
    // mistypes an address should be told the address is wrong, not asked to sign in first.
    const gated = [...app.matchAll(/<RequiresOperator>/g)].length
    assert.equal(gated, ROUTES.length, 'every declared route must be wrapped in RequiresOperator')
    const catchAll = /path="\*" element=\{<NotFoundPage \/>\}/.exec(app)
    assert.ok(catchAll, 'the catch-all must render NotFoundPage directly, without the gate')
  })
})

describe('the navigation and the deep link', () => {
  it('offers every route, because every one of them stands alone', () => {
    assert.equal(NAV.length, ROUTES.length)
  })

  it('names a deep link the app really owns', () => {
    // A probe against a path the app does not own proves only that the 404 page renders, which is
    // the opposite of what the check is for.
    const segment = DEEP_LINK_PATH.replace(/^\//, '')
    assert.ok(NON_INDEX_PATHS.includes(segment), `${DEEP_LINK_PATH} is not a declared route`)
  })

  it('passes that same path to CI', () => {
    const ci = readFileSync(join(root, '.github', 'workflows', 'ci.yml'), 'utf8')
    assert.match(ci, new RegExp(`deep-link-path:\\s*${DEEP_LINK_PATH}`))
  })

  it('records which Beacon route each page reads', () => {
    // Not decoration: it is what lets a reader go and curl the same thing this page rendered.
    for (const route of ROUTES) {
      assert.ok(route.reads && route.reads.includes('/v1/'), `${route.path || '/'} declares no read`)
    }
  })
})
