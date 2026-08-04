/**
 * What this bundle may and may not ask Beacon.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * TWO ENDPOINTS ARE DELIBERATELY UNREACHABLE FROM THIS BUNDLE, AND THIS FILE IS WHAT KEEPS THEM
 * THAT WAY.
 *
 * `POST /v1/gate` — the RECORDING form. "Asking the gate a question must not change what the gate
 * would answer next time" (`beacon/src/server.ts:16-18`). A console that recorded a decision every
 * time somebody typed a release tag would fill `gate_decisions` with evaluations nobody made, and
 * the history panel this app renders reads that table.
 *
 * `POST /v1/gate/overrides` — break-glass. The reasoning is in the header of `src/lib/beacon.ts`,
 * and the decisive part of it is that a form with a reason-code dropdown would put
 * `journey_skipped` and `conformance_never_run` in the same list, grey one out, and thereby
 * present an unknown as a waivable variant of a known — which is the exact conflation this whole
 * surface exists to prevent.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

const root = fileURLToPath(new URL('..', import.meta.url))

function sources(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...sources(full))
    else if (/\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

const files = sources(join(root, 'src'))
const all = files.map((f) => readFileSync(f, 'utf8')).join('\n')
/** Comments stripped, because this repository explains at length what it refuses to do. */
const code = files
  .map((f) => readFileSync(f, 'utf8'))
  .join('\n')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((line) => !/^\s*\/\//.test(line))
  .join('\n')

describe('this bundle is read-only against Beacon', () => {
  it('finds the source tree to check', () => {
    assert.ok(files.length >= 15, `expected the source tree, found ${String(files.length)} files`)
  })

  it('issues no request with a method other than GET, except the one that is not Beacon’s', () => {
    // `request()` defaults to GET and every caller in src/lib/beacon.ts omits `method`, so a
    // `method:` option appearing anywhere is the thing to catch.
    //
    // There are exactly TWO, and neither is a Beacon call: `performRefresh` posts to Nimbus's
    // `/auth/refresh`, and `flush` posts to Lantern's browser ingest. Counted rather than
    // pattern-excluded, which is the point — a check that allowed "POST, unless it looks fine"
    // would allow the next one too. If a third appears, this goes red and somebody has to justify
    // it.
    const posts = [...code.matchAll(/method:\s*'(POST|PUT|PATCH|DELETE)'/g)]
    assert.equal(posts.length, 2, `unexpected non-GET requests: ${posts.map((m) => m[0]).join(', ')}`)
    // And both are addressed to a host that is not `apiBase()`.
    const api = readFileSync(join(root, 'src', 'lib', 'api.ts'), 'utf8')
    assert.match(api, /fetch\(`\$\{nimbusUrl\(\)\}\/auth\/refresh`, \{\s*\n\s*method: 'POST'/)
    const obs = readFileSync(join(root, 'src', 'lib', 'obs.ts'), 'utf8')
    assert.match(obs, /fetch\(ingestUrl\(\), \{\s*\n\s*method: 'POST'/)
    assert.match(obs, /\$\{hosts\(\)\.lantern\}/)
  })

  it('exports no way to reach POST /v1/gate or the overrides route', () => {
    assert.doesNotMatch(code, /\/v1\/gate\/overrides/)
    // The gate path appears exactly twice in executable code: the GET, and the history read.
    const gateCalls = [...code.matchAll(/api<[^>]*>\('\/v1\/gate/g)]
    assert.equal(gateCalls.length, 2)
  })

  it('never sends the static break-glass token', () => {
    // A shared secret in a bundle is published to every reader of the page and to every extension
    // in their profile — and it authenticates as `service:beacon-token`, which would make every
    // action in the audit trail anonymous.
    //
    // Checked against comment-stripped CODE, not against the raw file: `src/lib/api.ts` explains
    // at length why the header must never be sent, and a guard that fires on its own rationale
    // trains people to disable the guard. The SECRET's value is checked against the raw file
    // instead, because a secret in a comment is still a secret in a repository.
    assert.doesNotMatch(code.toLowerCase(), /x-beacon-token/)
    assert.doesNotMatch(all, /estate-only-beacon-breakglass/)
  })

  it('records WHY the overrides route is absent, so its absence is a decision', () => {
    // A missing feature with no explanation is indistinguishable from an oversight, and the next
    // reader adds it back.
    const client = readFileSync(join(root, 'src', 'lib', 'beacon.ts'), 'utf8')
    assert.match(client, /POST \/v1\/gate\/overrides` is also absent/)
    assert.match(client, /waivable variant of a known/)
  })
})

describe('the wire shapes are the ones the service builds', () => {
  const client = readFileSync(join(root, 'src', 'lib', 'beacon.ts'), 'utf8')

  it('reads `release`, not `releaseTag`, off a gate answer', () => {
    // `gateBody()` renames it (`beacon/src/server.ts:849`). The domain type is `GateDecision`,
    // whose field is `releaseTag`; reading that off the wire gets `undefined`.
    assert.match(client, /interface GateAnswer \{\s*\n\s*readonly release: string/)
  })

  it('types every budget count as a string', () => {
    // They are bigints, and a JSON number above 2^53 has already lost its low bits by the time
    // anyone reads it (`beacon/src/server.ts:669-671`).
    const budget = /interface ErrorBudget \{([\s\S]*?)\n\}/.exec(client)
    assert.ok(budget)
    for (const field of ['total', 'good', 'bad', 'allowedBad', 'remaining', 'consumedPpm']) {
      assert.match(budget[1] ?? '', new RegExp(`readonly ${field}: string`), field)
    }
  })

  it('types a journey’s lastStatus as nullable, because never-run is not a pass', () => {
    assert.match(client, /readonly lastStatus: JourneyStatus \| null/)
  })

  it('takes determinacy from the wire rather than recomputing it', () => {
    assert.match(client, /readonly determinacy: Determinacy/)
  })
})
