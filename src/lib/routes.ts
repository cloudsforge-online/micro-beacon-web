/**
 * The route table, as data, in one place.
 *
 * Three files describe this app's addresses and all three have to agree:
 *
 *   1. `src/lib/routes.ts` — this file, from which the sub-navigation is derived,
 *   2. `src/app.tsx`       — which component renders at each path,
 *   3. `nginx.conf`        — which addresses are served the app shell at all.
 *
 * The third is the one that bites, and it bites late. nginx enumerates the real routes and 404s
 * everything else ON PURPOSE, so that a wrong address answers 404 rather than 200 — an app that
 * answers 200 for every address serves its "page not found" screen as a success, which crawlers
 * index and monitors call healthy, and a deploy that drops a route looks exactly like a deploy that
 * did not.
 *
 * On this surface that is not an abstraction. Beacon is what the estate points its monitors at; a
 * Beacon console answering 200 for every address is the monitor's own blind spot.
 *
 * `test/routes.test.ts` reads `nginx.conf` and `app.tsx` and fails the build when either has
 * drifted. "Remember to update nginx.conf" is not a mechanism; a test is.
 *
 * This module deliberately imports nothing — not React, not the router — so the test that reads it
 * does not have to boot a browser to find out what the routes are.
 */

export interface AppRoute {
  /** The top-level path segment, without a leading slash. `''` is the index route. */
  readonly path: string
  /** The sub-navigation label, or null for a route that is reachable but not offered. */
  readonly label: string | null
  /** Which Beacon route this page reads. `null` for a page that asks nothing. */
  readonly reads: string | null
}

/**
 * Every route on this surface needs a session, and there is no `public` column here.
 *
 * `micro-explorer-web`'s equivalent has one, because its reads are anonymous. Nothing here is:
 * `authorise()` (`beacon/src/server.ts:870-898`) requires a static token or an identity JWT on
 * every `/v1` route, and `beacon` is `adminOnly: true` in the registry
 * (`ui/packages/ui/src/surfaces.ts:406`). A column that would read `false` on every row is a column
 * somebody eventually reads as meaningful, so the fact is stated once, here, and enforced once, in
 * `src/app.tsx`, where a single gate wraps the whole tree.
 */
export const ROUTES: readonly AppRoute[] = [
  // The gate is the landing page and everything else is secondary. It is the only question this
  // service exists to answer that has a consequence attached to it.
  { path: '', label: 'Release gate', reads: 'GET /v1/gate, GET /v1/gate/history, GET /v1/slos' },
  { path: 'journeys', label: 'Journeys', reads: 'GET /v1/journeys' },
  { path: 'probes', label: 'Probes', reads: 'GET /v1/probes' },
  { path: 'incidents', label: 'Incidents', reads: 'GET /v1/incidents?open=true' },
  // Named `objectives` and not `slos`, because what the page mostly has to say is that there are
  // none — and "SLOs" as a heading over an empty panel reads as a section that failed to load.
  { path: 'objectives', label: 'Error budgets', reads: 'GET /v1/slos' },
  { path: 'conformance', label: 'Conformance', reads: 'GET /v1/conformance' },
]

/** What the sub-navigation renders, with the leading slash a `NavLink` wants. */
export const NAV: ReadonlyArray<{ to: string; label: string }> = ROUTES.filter(
  (route): route is AppRoute & { label: string } => route.label !== null,
).map((route) => ({ to: `/${route.path}`, label: route.label }))

/** Every path nginx has to serve the shell for, excluding the index. */
export const NON_INDEX_PATHS: readonly string[] = ROUTES.filter((r) => r.path !== '').map(
  (r) => r.path,
)

/**
 * A route this app owns, deep enough to prove the SPA fallback works.
 *
 * Passed to CI as the deep-link probe. It must be a REAL address — a probe against a path the app
 * does not own proves only that the 404 page renders, which is the opposite of what the check is
 * for. `/objectives` is chosen over the others deliberately: it is the page carrying the estate's
 * live defect, so a deploy that cannot serve it on a hard refresh is one that has hidden the
 * finding.
 */
export const DEEP_LINK_PATH = '/objectives'

/**
 * Paths this container must NOT serve, because they belong to micro-beacon.
 *
 * Enumerated here as well as in nginx.conf so `test/routes.test.ts` can check the two agree. In
 * production this bundle and the service share `beacon.<apex>`; something in front has to decide
 * which answers what, and today nothing does — `deploy/gateway/dynamic/estate-web.yml:432` routes
 * the whole host to the API. See the README, "What deploy has to do".
 */
export const SERVICE_PREFIXES: readonly string[] = ['v1', 'api', 'metrics', 'livez', 'readyz']
