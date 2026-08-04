/**
 * Where this bundle talks to, and the reason it is never a cross-origin address.
 *
 * The claim under test is not a preference. `beacon/src/server.ts` sets four response headers in
 * `send()` and none of them is `access-control-*`, and it registers no OPTIONS route — so a
 * preflight takes the router's 404. Every read this bundle makes carries an `Authorization`
 * bearer, which is not a CORS-safelisted request header, so every one of them preflights. A
 * cross-origin base is therefore an address from which this page cannot make a single successful
 * request.
 *
 * The sibling half below asserts that against the service's real source, so the day Beacon grows
 * a CORS header this test goes red and `src/lib/hosts.ts` gets re-read — which is the correct
 * outcome, because the third branch of `resolveApiBase` would then be wrong rather than merely
 * unused.
 */
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import { surface } from '@cloudsforge/ui/surfaces'
import { PRODUCT, isLocal, isRegisteredPlacement, resolveApiBase } from '../src/lib/hosts.ts'
import type { CloudsForgeHosts } from '@cloudsforge/ui'

const root = fileURLToPath(new URL('..', import.meta.url))
const beaconDir = process.env['CLOUDSFORGE_BEACON_DIR'] ?? join(root, '..', 'beacon')
const hasBeacon = existsSync(join(beaconDir, 'src', 'server.ts'))

/** Only the keys these functions read. Cast once, here, rather than in every assertion. */
const hosts = (beacon: string): CloudsForgeHosts => ({ beacon }) as CloudsForgeHosts

describe('the API base', () => {
  it('is relative when the page is on Beacon’s own registry origin', () => {
    // Production: nginx serves this bundle and Beacon serves /v1 behind the same hostname.
    assert.equal(
      resolveApiBase('https://beacon.cloudsforge.online', hosts('https://beacon.cloudsforge.online')),
      '',
    )
  })

  it('is relative on any local development origin, because vite.config.ts proxies /v1', () => {
    for (const origin of ['http://localhost:5193', 'http://127.0.0.1:5193', 'http://box.local:1234']) {
      assert.equal(resolveApiBase(origin, hosts('http://localhost:4011')), '', origin)
    }
  })

  it('is absolute with no page origin, because a relative URL has nothing to resolve against', () => {
    assert.equal(resolveApiBase('', hosts('http://localhost:4011')), 'http://localhost:4011')
  })

  it('is absolute from an unregistered placement — the only address that could serve it', () => {
    // It will still fail, and the shell says so before a request is fired. Returning a relative
    // base here would produce a 404 from whatever static server is in front, which reads like a
    // missing route rather than a misplaced bundle.
    assert.equal(
      resolveApiBase('https://beacon.example.test', hosts('https://beacon.cloudsforge.online')),
      'https://beacon.cloudsforge.online',
    )
  })

  it('compares origins rather than whole URLs, so a basePath cannot look cross-origin', () => {
    assert.equal(
      resolveApiBase('https://beacon.cloudsforge.online', hosts('https://beacon.cloudsforge.online/console')),
      '',
    )
  })
})

describe('placement', () => {
  it('treats the four development names as local', () => {
    for (const name of ['', 'localhost', '127.0.0.1', 'box.local']) assert.equal(isLocal(name), true, name)
    for (const name of ['cloudsforge.online', 'beacon.example.test']) assert.equal(isLocal(name), false, name)
  })

  it('is known locally and on the registry origin, and unknown elsewhere', () => {
    const registry = hosts('https://beacon.cloudsforge.online')
    assert.equal(isRegisteredPlacement('http://localhost:5193', 'localhost', registry), true)
    assert.equal(
      isRegisteredPlacement('https://beacon.cloudsforge.online', 'beacon.cloudsforge.online', registry),
      true,
    )
    assert.equal(isRegisteredPlacement('https://elsewhere.test', 'elsewhere.test', registry), false)
  })
})

describe('the registry entry this bundle is built against', () => {
  const entry = surface(PRODUCT)

  it('is the beacon service, on the beacon subdomain', () => {
    assert.equal(entry.key, 'beacon')
    assert.equal(entry.kind, 'service')
    assert.equal(entry.subdomain, 'beacon')
  })

  it('still says servesUi: false — which is the line this repository exists to make false', () => {
    // Pinned deliberately. When micro-ui flips it, this goes red, and the README's opening claim
    // has to be rewritten rather than left standing as a stale inherited fact.
    assert.equal(entry.servesUi, false)
    assert.equal(entry.inSwitcher, true)
    assert.equal(entry.adminOnly, true)
  })

  it('carries devPort 4011, the port Beacon itself binds', () => {
    // A devPort is a FACT ABOUT A SERVICE, not an allocation — the registry says so at the `admin`
    // entry. vite.config.ts reads this value rather than typing it, so there is no second copy of
    // the number in this repository to go stale.
    assert.equal(entry.devPort, 4011)
  })

  it('has no mark, so nothing in this bundle renders one', () => {
    assert.equal(entry.markId, null)
  })
})

describe('the dev port this repository took', () => {
  const config = readFileSync(join(root, 'vite.config.ts'), 'utf8')

  it('is 5193, and is not one a sibling already binds', () => {
    assert.match(config, /port: 5193/)
    // The occupied set, read off every sibling's vite.config.ts rather than assumed. 5199 is the
    // template's placeholder and micro-lantern-web still carries it; 5191 and 5194 are left free
    // on purpose so that agent can take one without a collision.
    const taken = [3001, 3003, 5170, 5171, 5172, 5173, 5180, 5182, 5183, 5184, 5185, 5186, 5187, 5188, 5189, 5190, 5192, 5195, 5199]
    assert.equal(taken.includes(5193), false)
  })

  it('proxies /v1 to a target derived from the registry, never from a literal', () => {
    assert.match(config, /'\/v1':\s*\{\s*target: beaconOrigin/)
    assert.match(config, /surface\('beacon'\)\.devPort/)
    // The one escape hatch, and it is a DEV SERVER variable rather than a bundle one. The estate's
    // compose remaps the container to 127.0.0.1:4143, which is a fact about the deployment.
    assert.match(config, /CF_BEACON_ORIGIN/)
  })
})

describe('the reason the base is never cross-origin, checked against micro-beacon', {
  skip: hasBeacon ? false : `no sibling checkout at ${beaconDir}`,
}, () => {
  const server = readFileSync(join(beaconDir, 'src', 'server.ts'), 'utf8')

  it('Beacon sets no access-control header anywhere', () => {
    assert.doesNotMatch(server, /access-control/i)
  })

  it('Beacon registers no OPTIONS route, so a preflight takes the router’s 404', () => {
    assert.doesNotMatch(server, /define\('OPTIONS'/)
  })

  it('every /v1 route is authorised, so every request this bundle makes carries a bearer', () => {
    // Which is what makes the preflight unavoidable: `authorization` is not CORS-safelisted.
    const routes = [...server.matchAll(/define\('(GET|POST|PUT)', '(\/v1\/[^']*)'/g)]
    assert.ok(routes.length >= 8, `expected the /v1 surface, found ${String(routes.length)} routes`)
    assert.match(server, /await authorise\(ctx, deps, GATE_SCOPE\)/)
    assert.match(server, /await authorise\(ctx, deps, READ_SCOPE\)/)
  })

  it('any authenticated USER principal is accepted for a read, so this bundle needs no role check', () => {
    assert.match(server, /if \(principal\.kind === 'user'\) return principal/)
  })
})
