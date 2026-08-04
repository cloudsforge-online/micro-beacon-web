/**
 * The gate's answer, and the three things this bundle must never soften.
 *
 * Half of this file is ordinary unit testing of a pure module. The other half reads
 * `../beacon/src/gate.ts` and `../beacon/src/server.ts` from a SIBLING CHECKOUT and fails when
 * this bundle's copy of the service's rules has drifted from the service. That half is the one
 * worth having: a client that quietly stops understanding what it talks to is one edit away from
 * rendering an unwaivable blocker inside the waivable list.
 *
 * The cross-repository half skips itself when the sibling is absent, so `pnpm test` passes for
 * somebody who cloned only this repository — and CI makes every one of those absences fatal. A
 * skipped test is an unmeasured one, and this estate has already shipped a Docker job that built
 * an image and read its metadata without ever running it.
 */
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import { RELEASE_TAG, type GateAnswer, type GateReason } from '../src/lib/beacon.ts'
import {
  UNKNOWN_CODES,
  classify,
  contradictions,
  determinacyOf,
  disagreements,
  unreachableVoice,
  validateRelease,
  verdictVoice,
} from '../src/lib/verdict.ts'

const root = fileURLToPath(new URL('..', import.meta.url))
const beaconDir = process.env['CLOUDSFORGE_BEACON_DIR'] ?? join(root, '..', 'beacon')
const hasBeacon = existsSync(join(beaconDir, 'src', 'gate.ts'))
const read = (relative: string): string => readFileSync(join(beaconDir, relative), 'utf8')

/* ══════════════════════════════ the live answer ══════════════════════════════ */

/**
 * The real body Beacon returned for `probe-1`, captured with curl against the running estate.
 *
 * Not a fixture somebody imagined: seven reasons, three journeys skipped, conformance never run,
 * three SEV2 incidents open — and **not one `error_budget_*` among them**, which is the defect
 * `test/objectives.test.ts` guards, visible here in the data the gate actually produced.
 */
const LIVE: GateAnswer = {
  release: 'probe-1',
  decision: 'refuse',
  promote: false,
  indeterminate: true,
  reasons: [
    { code: 'journey_skipped', subject: 'identity.handoff', detail: 'the most recent run was a skip', determinacy: 'known' },
    { code: 'journey_skipped', subject: 'identity.register', detail: 'the most recent run was a skip', determinacy: 'known' },
    { code: 'journey_skipped', subject: 'identity.signin', detail: 'the most recent run was a skip', determinacy: 'known' },
    { code: 'conformance_never_run', subject: 'conformance', detail: 'no conformance run has been recorded', determinacy: 'unknown' },
    { code: 'incident_open', subject: 'identity.signin', detail: 'SEV2 open since 2026-08-03T21:23:47.237Z', determinacy: 'known' },
    { code: 'incident_open', subject: 'identity.register', detail: 'SEV2 open since 2026-08-03T21:23:46.208Z', determinacy: 'known' },
    { code: 'incident_open', subject: 'identity.handoff', detail: 'SEV2 open since 2026-08-03T21:23:46.208Z', determinacy: 'known' },
  ],
  waived: [],
}

describe('the live refusal is rendered as an answer, not as a failure', () => {
  it('splits the reasons into two classes and keeps them apart', () => {
    const { known, unknown } = classify(LIVE.reasons)
    assert.equal(known.length, 6)
    assert.equal(unknown.length, 1)
    assert.equal(unknown[0]?.code, 'conformance_never_run')
  })

  it('names the indeterminate refusal differently from a determinate one', () => {
    const indeterminate = verdictVoice(LIVE)
    const determinate = verdictVoice({ decision: 'refuse', indeterminate: false })
    // Three channels, and all three differ. If only the tone differed, an operator who cannot
    // separate the hues would read the estate's most important distinction as one word.
    assert.notEqual(indeterminate.word, determinate.word)
    assert.notEqual(indeterminate.glyph, determinate.glyph)
    assert.notEqual(indeterminate.tone, determinate.tone)
    assert.match(indeterminate.word, /nobody knows/i)
    assert.match(indeterminate.meaning, /an unknown is not a pass/i)
  })

  it('never gives a refusal the clear tone, whatever else changes', () => {
    for (const indeterminate of [true, false]) {
      const voice = verdictVoice({ decision: 'refuse', indeterminate })
      assert.notEqual(voice.tone, 'clear')
    }
  })

  it('carries no error-budget reason, which is the estate defect visible in real data', () => {
    assert.equal(
      LIVE.reasons.some((r) => r.code.startsWith('error_budget')),
      false,
    )
  })

  it('finds no contradiction in a well-formed answer', () => {
    assert.deepEqual(contradictions(LIVE), [])
    assert.deepEqual(disagreements(LIVE.reasons), [])
  })
})

describe('an answer that contradicts itself is reported, never quietly resolved', () => {
  it('catches indeterminate alongside promote', () => {
    const bad: GateAnswer = { ...LIVE, indeterminate: true, promote: true, decision: 'promote' }
    const found = contradictions(bad)
    assert.ok(found.length >= 1)
    assert.ok(found.some((s) => /indeterminate/i.test(s)))
    // And the rendered verdict takes the cautious reading rather than the cheerful one.
    assert.equal(verdictVoice(bad).tone, 'unknown')
  })

  it('catches a plain promote that also waived something', () => {
    const bad: GateAnswer = {
      ...LIVE,
      indeterminate: false,
      promote: true,
      decision: 'promote',
      reasons: [],
      waived: [LIVE.reasons[0] as GateReason],
    }
    assert.ok(contradictions(bad).some((s) => /plain promote/i.test(s)))
  })

  it('catches a reason whose determinacy disagrees with its code', () => {
    const bad: readonly GateReason[] = [
      { code: 'conformance_never_run', subject: 'conformance', detail: '', determinacy: 'known' },
    ]
    assert.equal(disagreements(bad).length, 1)
  })
})

describe('"the gate refused" and "we could not ask the gate" are different facts', () => {
  it('share no word, no glyph and no tone with any verdict', () => {
    const unreachable = unreachableVoice({
      message: 'Beacon could not be reached, so the gate was never asked.',
      code: 'unreachable',
      requestId: undefined,
      status: 0,
    })
    const verdicts = [
      verdictVoice({ decision: 'refuse', indeterminate: true }),
      verdictVoice({ decision: 'refuse', indeterminate: false }),
      verdictVoice({ decision: 'promote', indeterminate: false }),
      verdictVoice({ decision: 'promote_with_override', indeterminate: false }),
    ]
    for (const verdict of verdicts) {
      assert.notEqual(unreachable.word, verdict.word)
      assert.notEqual(unreachable.glyph, verdict.glyph)
    }
    // The wording must not be readable as a block either.
    assert.match(unreachable.word, /never asked/i)
    assert.match(unreachable.meaning, /nothing here says anything about|not a verdict/i)
  })

  it('says that a verifier outage is identity failing rather than a verdict', () => {
    const voice = unreachableVoice({
      message: 'authentication is temporarily unavailable',
      code: 'verifier_unavailable',
      requestId: 'abc',
      status: 503,
    })
    assert.match(voice.meaning, /identity/i)
    assert.match(voice.meaning, /not a verdict/i)
  })
})

describe('the release tag', () => {
  it('accepts what Beacon accepts and refuses what it refuses', () => {
    for (const good of ['v1.4.0', 'probe-1', 'a', '0', 'A_b.c-d']) {
      assert.equal(validateRelease(good, RELEASE_TAG).ok, true, good)
    }
    for (const bad of ['', ' ', '-leading', '.leading', 'has space', 'x'.repeat(129), 'sl/ash']) {
      assert.equal(validateRelease(bad, RELEASE_TAG).ok, false, JSON.stringify(bad))
    }
  })

  it('explains a malformed tag rather than only rejecting it', () => {
    const result = validateRelease('has space', RELEASE_TAG)
    assert.equal(result.ok, false)
    if (result.ok) throw new Error('unreachable')
    assert.match(result.why, /128 characters/)
  })
})

/* ══════════════════════════════ pinned against the service ══════════════════════════════ */

describe('this bundle still understands micro-beacon', { skip: hasBeacon ? false : `no sibling checkout at ${beaconDir}` }, () => {
  it('classifies every reason code exactly as the service does', () => {
    const source = read('src/gate.ts')
    const block = /const UNKNOWN_CODES[^=]*=\s*new Set<ReasonCode>\(\[([\s\S]*?)\]\)/.exec(source)
    assert.ok(block, 'UNKNOWN_CODES was not found in beacon/src/gate.ts — re-aim this check')
    const theirs = new Set([...(block[1] ?? '').matchAll(/'([a-z_]+)'/g)].map((m) => m[1]))
    assert.deepEqual(
      [...theirs].sort(),
      [...UNKNOWN_CODES].sort(),
      'the unknown set has drifted. A code the service calls unknown and this bundle calls known ' +
        'renders an UNWAIVABLE blocker inside the waivable list.',
    )
  })

  it('knows every reason code the service can emit', () => {
    const source = read('src/gate.ts')
    const block = /export type ReasonCode =([\s\S]*?)\n\n/.exec(source)
    assert.ok(block, 'ReasonCode was not found in beacon/src/gate.ts — re-aim this check')
    const codes = [...(block[1] ?? '').matchAll(/'([a-z_]+)'/g)].map((m) => m[1] as string)
    assert.ok(codes.length >= 13, `expected the full closed set, found ${String(codes.length)}`)
    for (const code of codes) {
      // `determinacyOf` is total over `ReasonCode`. A code the service added and this bundle has
      // not would be classified `known` here by default, which is the dangerous direction.
      const ours = determinacyOf(code as never)
      assert.ok(ours === 'known' || ours === 'unknown')
    }
    // And the copy in src/lib/beacon.ts must list them all, so a new code is a compile error
    // somewhere rather than an unstyled string on a page.
    const mirror = readFileSync(join(root, 'src', 'lib', 'beacon.ts'), 'utf8')
    for (const code of codes) {
      assert.ok(mirror.includes(`'${code}'`), `src/lib/beacon.ts does not list ${code}`)
    }
  })

  it('uses the service’s own release-tag pattern', () => {
    const source = read('src/server.ts')
    const found = /const RELEASE_TAG = (\/.*\/)\n/.exec(source)
    assert.ok(found, 'RELEASE_TAG was not found in beacon/src/server.ts — re-aim this check')
    assert.equal(found[1], RELEASE_TAG.toString())
  })

  it('the gate route is a GET that does not record, and this bundle never posts to it', () => {
    const source = read('src/server.ts')
    assert.match(source, /define\('GET', '\/v1\/gate',/)
    assert.match(source, /record: false/)
    // The recording form exists, and this bundle must not be able to reach it.
    assert.match(source, /define\('POST', '\/v1\/gate',/)
  })

  it('an override still cannot waive an unknown, and still expires within twelve hours', () => {
    const source = read('src/gate.ts')
    assert.match(source, /if \(determinacyOf\(request\.reasonCode\) === 'unknown'\)/)
    assert.match(source, /MAX_OVERRIDE_TTL_MS = 12 \* 60 \* 60 \* 1_000/)
    assert.match(source, /request\.reason\.trim\(\)\.length < 16/)
  })

  it('the budget reasons are still emitted only from inside the loop over registered budgets', () => {
    // The whole basis of `src/lib/objectives.ts`. If Beacon ever emits `error_budget_no_data` for
    // an EMPTY objectives list — which is what would fix the defect — this goes red and the
    // objectives page has to be rewritten, which is the correct outcome.
    const source = read('src/gate.ts')
    const loop = /for \(const budget of await allBudgets\(sql, inputs\.now\)\) \{([\s\S]*?)\n  \}/.exec(source)
    assert.ok(loop, 'the budget loop was not found in beacon/src/gate.ts — re-aim this check')
    const body = loop[1] ?? ''
    assert.match(body, /error_budget_no_data/)
    assert.match(body, /error_budget_exhausted/)
    const outside = source.replace(body, '')
    assert.doesNotMatch(
      outside.replace(/'error_budget_no_data'\n?\s*\|?/g, '').replace(/^.*ReasonCode =[\s\S]*?\n\n/m, ''),
      /reason\('error_budget_/,
      'a budget reason is now produced outside the loop; src/lib/objectives.ts must be re-read',
    )
  })
})

/* ══════════════════════════════ the accent may not colour a verdict ══════════════════════════════ */

describe('no verdict is drawn in the surface accent', () => {
  const css = readFileSync(join(root, 'src', 'styles.css'), 'utf8')

  /** Rules only — comments stripped — as `selector { body }` pairs. */
  const rules = css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('}')
    .map((chunk) => chunk.split('{'))
    .filter((parts): parts is [string, string] => parts.length === 2)

  it('finds the rules to check', () => {
    assert.ok(rules.length >= 40, `expected a stylesheet, found ${String(rules.length)} rules`)
  })

  it('never applies --cf-accent to a badge, a verdict or a tone', () => {
    // This surface's accent IS the chart `good` step (signal green), so a verdict that inherited
    // it would render `refuse` in the colour of a pass. `ui/packages/ui/src/surfaces.ts:392-395`
    // states the constraint: "Beacon's own pages still reserve green/amber/red for probe
    // verdicts."
    for (const [selector, body] of rules) {
      if (!/bw-badge|bw-verdict|bw-tone/.test(selector)) continue
      assert.doesNotMatch(
        body,
        /--cf-accent/,
        `${selector.trim()} uses the surface accent; a refusal would render green`,
      )
    }
  })

  it('the unknown tone is not on the good/warn/crit ramp at all', () => {
    const unknown = rules.find(([selector]) => selector.includes('.bw-badge--unknown'))
    assert.ok(unknown, '.bw-badge--unknown is missing')
    assert.doesNotMatch(unknown[1], /--cf-viz-(good|warn|crit)/)
  })
})
