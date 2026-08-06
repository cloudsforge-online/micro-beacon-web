/**
 * Where this app talks to, resolved at runtime.
 *
 * `cloudsforgeHosts()` reads `window.location.hostname` on every call, so one image serves
 * localhost, a preview deployment and production. Nothing here reads a build-time constant; see
 * the note in vite.config.ts and `test/no-build-time-config.test.ts`.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * **THE ONLY API BASE A BROWSER CAN USE FOR BEACON IS A SAME-ORIGIN ONE.**
 *
 * This is not a preference. It was driven against the running service before a line of this file
 * was written:
 *
 *   curl -s -D- -o /dev/null -X OPTIONS -H 'Origin: http://localhost:5193' \
 *     -H 'Access-Control-Request-Method: GET' -H 'Access-Control-Request-Headers: authorization' \
 *     http://127.0.0.1:4143/v1/gate?release=probe-1
 *   → HTTP/1.1 404 Not Found
 *
 * `beacon/src/server.ts` sets four response headers and none of them is `access-control-*`
 * (`send()`, `beacon/src/server.ts`), and it registers no OPTIONS route, so a preflight
 * takes the router's 404. The estate's CORS is a single gateway middleware,
 * `cf-cors` at `deploy/gateway/dynamic/policy.yml`, whose allowlist names production origins
 * only — there is no `localhost` entry in it and no `beacon.<apex>` router that would need one.
 *
 * Every read this bundle makes carries an `Authorization` bearer, which is not a CORS-safelisted
 * request header, so every one of them triggers a preflight. A cross-origin base is therefore not
 * "slower" or "needs CORS configuring": it is an address from which this page cannot make a
 * single successful request, and the failure appears in the browser console rather than in any
 * server log.
 *
 * So `resolveApiBase` returns the RELATIVE base in the two arrangements that work, and the
 * absolute one only where nothing can work anyway — an unregistered placement, where the shell
 * says so out loud rather than firing requests into a refusal nobody can read.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ── This surface's API is its own host, and that is unusual for the estate's Beacon clients ────
 *
 * `micro-status-web` reads Beacon too, and its `hosts.ts` opens by saying "THIS APP'S API IS NOT
 * ITS OWN HOST" — it is a bundle at `status.<apex>` reading a document produced at
 * `beacon.<apex>`. This bundle is the other case: it IS Beacon's surface. The registry declares
 * `beacon` with `subdomain: 'beacon'` and, since 2026-08-04, `servesUi: true`
 * — the line this repository existed to make false, made false. Alongside it `inSwitcher: true`,
 * which used to mean an operator could pick "Beacon" out of the switcher and land on a 404. That
 * is what this bundle fixed. Verified through the real gateway, before and after:
 *
 *   curl -s --cacert deploy/gateway/certs/ca.crt -o /dev/null -w '%{http_code}' \
 *     https://beacon.cloudsforge.localtest.me/
 *   → 404   (before this repository existed)
 *   → 200   (now, text/html — the router is `cf-web-beacon` at priority 500, with the API
 *            renamed to `cf-svc-beacon` at 600 so the two cannot shadow each other)
 */
import { cloudsforgeHosts, type CloudsForgeHosts, type SurfaceKey } from '@cloudsforge/ui'

/**
 * The surface this application IS.
 *
 * `markId` is null for it (`ui/packages/ui/src/surfaces.ts`), so no mark is rendered anywhere
 * in this bundle — see the note in `src/components/shell.tsx`.
 */
export const PRODUCT: SurfaceKey = 'beacon'

/** The name reported to the observability ingest and shown in error copy. */
export const APP_NAME = 'beacon-web'

/**
 * The base URL for Beacon's API.
 *
 * Three branches, each a different arrangement rather than a different preference:
 *
 *   1. **No page origin** — a test, a prerender. There is nothing for a relative URL to resolve
 *      against, so the absolute form is the only answer that is even well formed.
 *   2. **The page is on Beacon's own registry origin** (production, and `pnpm preview` behind a
 *      front that also carries the service) — relative. The bundle and the service share the
 *      hostname; see nginx.conf for what has to route between them.
 *   3. **The page is on a local development origin** — relative, because `vite.config.ts` proxies
 *      `/v1` and `/api` to Beacon. This is the branch that would ordinarily be the absolute one,
 *      and the header above is why it is not: an absolute base here is an address the browser
 *      refuses before the request leaves the page.
 *
 * Anything else is an unregistered placement. It gets the absolute base — the only address that
 * could conceivably serve it — and the shell tells the reader the requests will be refused by
 * their own browser. Returning a relative base there would be worse: it would produce a 404 from
 * whatever static server is in front, which reads like a missing route rather than a misplaced
 * bundle.
 *
 * Pure, and exported, so `test/hosts.test.ts` can pin all four cases without a browser.
 */
export function resolveApiBase(pageOrigin: string, hosts: CloudsForgeHosts): string {
  const own = hosts[PRODUCT]
  if (!pageOrigin) return own
  // A surface may carry a basePath (the wallet is a path inside Hub), so compare ORIGINS rather
  // than whole URLs — otherwise every such surface would look cross-origin to itself.
  if (new URL(own).origin === pageOrigin) return ''
  if (isLocal(hostnameOf(pageOrigin))) return ''
  return own
}

/** The hostname of an origin, or `''` when it is not a URL at all. */
export function hostnameOf(origin: string): string {
  try {
    return new URL(origin).hostname
  } catch {
    return ''
  }
}

/** The same four names `cloudsforgeHosts()` treats as development. Kept in step by test. */
export function isLocal(hostname: string): boolean {
  return (
    hostname === '' ||
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.endsWith('.local')
  )
}

/**
 * Whether this bundle is being served from an address the surface registry knows.
 *
 * `cloudsforgeHosts()` derives the apex by stripping a KNOWN subdomain prefix. Served from an
 * unknown name, the whole name becomes the apex, and every CloudsForge URL derived from it — the
 * account portal, Lantern's ingest, and this app's own API — resolves one level too deep.
 *
 * On a public reference surface that is a notice. Here it is closer to a refusal, because of what
 * follows from it: the API base becomes cross-origin, and a cross-origin request to Beacon cannot
 * complete. The shell says both halves.
 */
export function isRegisteredPlacement(
  pageOrigin: string,
  hostname: string,
  hosts: CloudsForgeHosts,
): boolean {
  if (isLocal(hostname)) return true
  if (!pageOrigin) return true
  try {
    return new URL(hosts[PRODUCT]).origin === pageOrigin
  } catch {
    return false
  }
}

/** Every CloudsForge base URL, for the current environment. */
export function hosts(): CloudsForgeHosts {
  return cloudsforgeHosts()
}

/** This app's API base, resolved now. Call it per request; never cache it in a module constant. */
export function apiBase(): string {
  return resolveApiBase(pageOrigin(), cloudsforgeHosts())
}

/** The page origin, or a stable placeholder when there is no document (tests, prerender). */
export function pageOrigin(): string {
  return typeof window === 'undefined' ? 'http://localhost' : window.location.origin
}

/** Whether the current address is one the registry knows. Read by the shell. */
export function placementIsKnown(): boolean {
  if (typeof window === 'undefined') return true
  return isRegisteredPlacement(window.location.origin, window.location.hostname, cloudsforgeHosts())
}
